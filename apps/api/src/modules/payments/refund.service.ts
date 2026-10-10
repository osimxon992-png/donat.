import type { Payment, Prisma, PrismaClient, Refund } from '@prisma/client';
import { conflict, notFound, unprocessable } from '../../lib/errors';
import type { Logger } from '../../lib/logger';
import type { AuditService } from '../audit/audit.service';
import type { NotificationService } from '../notifications/notification.service';
import type { OrderStateService } from '../orders/order-state.service';
import type { PaymentWebhookEvent } from './payment-provider';
import type { PaymentProviderRegistry } from './payment-provider.registry';

const REFUNDABLE_ORDER_STATUSES = ['PAID', 'QUEUED', 'FAILED', 'MANUAL_REVIEW'] as const;

export class RefundService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly registry: PaymentProviderRegistry,
    private readonly orderState: OrderStateService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
    private readonly logger: Logger,
  ) {}

  /**
   * Full refund of an order's captured payment (admin action).
   * Blocked while any fulfillment attempt has an unknown outcome: the top-up might have been
   * delivered, so the supplier must be reconciled first.
   */
  async refundOrder(orderId: string, actorId: string, reason: string): Promise<Refund> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: { where: { status: 'SUCCEEDED' } }, attempts: true },
    });
    if (!order) throw notFound('Order');
    if (!(REFUNDABLE_ORDER_STATUSES as readonly string[]).includes(order.status)) {
      throw unprocessable(`Orders in status ${order.status} cannot be refunded`, 'NOT_REFUNDABLE');
    }
    if (order.attempts.some((a) => a.status === 'PENDING' || a.status === 'UNKNOWN')) {
      throw conflict('A delivery attempt has an unknown outcome. Reconcile with the supplier before refunding.', 'RECONCILE_FIRST');
    }
    if (order.attempts.some((a) => a.status === 'SUCCEEDED')) {
      throw conflict('The supplier confirmed delivery for this order; it cannot be refunded automatically.', 'ALREADY_DELIVERED');
    }
    const payment = order.payments[0];
    if (!payment) throw unprocessable('No captured payment found for this order', 'NO_CAPTURED_PAYMENT');

    const refund = await this.prisma.$transaction(async (tx) => {
      await this.orderState.transition(tx, orderId, 'REFUND_PENDING', {
        from: REFUNDABLE_ORDER_STATUSES,
        message: `Refund requested: ${reason}`,
        actorId,
      });
      const created = await tx.refund.create({
        data: {
          orderId,
          paymentId: payment.id,
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          reason,
          requestedById: actorId,
          idempotencyKey: `refund-${orderId}-${payment.id}`,
        },
      });
      await this.audit.log(
        { actorId, action: 'order.refund_requested', entityType: 'Order', entityId: orderId, metadata: { reason, refundId: created.id } },
        tx,
      );
      return created;
    });
    return this.executeRefund(refund.id);
  }

  /** Call the gateway for a PENDING refund. Idempotent on the refund's idempotency key. */
  async executeRefund(refundId: string): Promise<Refund> {
    const refund = await this.prisma.refund.findUniqueOrThrow({ where: { id: refundId }, include: { payment: true } });
    if (refund.status !== 'PENDING') return refund;
    const provider = this.registry.get(refund.payment.provider);
    let result;
    try {
      result = await provider.refund({
        providerPaymentId: refund.payment.providerPaymentId ?? '',
        amountMinor: refund.amountMinor,
        currency: refund.currency,
        idempotencyKey: refund.idempotencyKey,
        reason: refund.reason,
      });
    } catch (err) {
      this.logger.error({ err, refundId }, 'refund call failed; will stay pending');
      return refund;
    }
    if (result.status === 'PENDING') {
      return this.prisma.refund.update({ where: { id: refundId }, data: { providerRefundId: result.providerRefundId } });
    }
    return this.prisma.$transaction((tx) =>
      this.finalise(tx, refund, refund.payment, result.status === 'SUCCEEDED', result.providerRefundId, result.failureReason),
    );
  }

  /** Webhook path for gateways that confirm refunds asynchronously. */
  async applyRefundEvent(tx: Prisma.TransactionClient, payment: Payment, event: PaymentWebhookEvent) {
    const refund = await tx.refund.findFirst({ where: { paymentId: payment.id, status: 'PENDING' }, orderBy: { createdAt: 'asc' } });
    if (!refund) return { applied: false, note: 'no pending refund' };
    await this.finalise(tx, refund, payment, event.type === 'refund.succeeded', event.providerRefundId, event.failureReason);
    return { applied: true, note: undefined };
  }

  private async finalise(
    tx: Prisma.TransactionClient,
    refund: Refund,
    payment: Payment,
    succeeded: boolean,
    providerRefundId?: string,
    failureReason?: string,
  ): Promise<Refund> {
    const swapped = await tx.refund.updateMany({
      where: { id: refund.id, status: 'PENDING' },
      data: {
        status: succeeded ? 'SUCCEEDED' : 'FAILED',
        providerRefundId,
        failureReason: succeeded ? null : failureReason ?? 'refund failed',
        processedAt: new Date(),
      },
    });
    if (swapped.count === 1) {
      await tx.paymentTransaction.create({
        data: {
          paymentId: payment.id,
          type: 'REFUND',
          status: succeeded ? 'SUCCEEDED' : 'FAILED',
          amountMinor: refund.amountMinor,
          currency: refund.currency,
          providerTransactionId: providerRefundId ?? `refund-${refund.id}`,
        },
      });
      const order = await tx.order.findUniqueOrThrow({ where: { id: refund.orderId } });
      if (succeeded) {
        await tx.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED' } });
        if (order.status === 'REFUND_PENDING') {
          await this.orderState.transition(tx, order.id, 'REFUNDED', { message: 'Refund completed' });
        }
        await this.notifications.notify(
          {
            userId: order.userId,
            type: 'order.refunded',
            title: `Refund issued for ${order.orderNumber}`,
            body: 'Your payment has been refunded. It may take a few days to appear on your statement.',
            link: `/orders/${order.id}`,
          },
          tx,
        );
      } else if (order.status === 'REFUND_PENDING') {
        await this.orderState.transition(tx, order.id, 'MANUAL_REVIEW', {
          message: `Refund failed: ${failureReason ?? 'unknown reason'}`,
          data: { failureReason: `Refund failed: ${failureReason ?? 'unknown'}` },
        });
      }
    }
    return tx.refund.findUniqueOrThrow({ where: { id: refund.id } });
  }

  /** Refund a capture that arrived for an order that can no longer use it (late or duplicate payment). */
  async refundUnexpectedCapture(paymentId: string, reason: string): Promise<Refund> {
    const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    const refund = await this.prisma.refund.upsert({
      where: { idempotencyKey: `auto-refund-${paymentId}` },
      update: {},
      create: {
        orderId: payment.orderId,
        paymentId,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        reason: `Automatic: ${reason}`,
        idempotencyKey: `auto-refund-${paymentId}`,
      },
    });
    await this.audit.log({
      action: 'payment.auto_refund',
      entityType: 'Payment',
      entityId: paymentId,
      metadata: { reason, refundId: refund.id },
    });
    return this.executeRefund(refund.id);
  }

  /** Retry refunds stuck in PENDING (gateway outage). */
  async retryPendingRefunds(olderThanMs = 5 * 60_000): Promise<number> {
    const pending = await this.prisma.refund.findMany({
      where: { status: 'PENDING', createdAt: { lt: new Date(Date.now() - olderThanMs) } },
      take: 50,
    });
    for (const r of pending) await this.executeRefund(r.id);
    return pending.length;
  }
}
