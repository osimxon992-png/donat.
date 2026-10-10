import type { Payment, Prisma, PrismaClient } from '@prisma/client';
import type { Env } from '../../config/env';
import { conflict, notFound, unprocessable } from '../../lib/errors';
import { redact, type Logger } from '../../lib/logger';
import type { AuditService } from '../audit/audit.service';
import type { FulfillmentQueueService } from '../fulfillment/fulfillment-queue.service';
import type { NotificationService } from '../notifications/notification.service';
import type { OrderStateService } from '../orders/order-state.service';
import type { PaymentProviderRegistry } from './payment-provider.registry';
import { WebhookVerificationError, type PaymentWebhookEvent, type WebhookHeaders } from './payment-provider';
import type { RefundService } from './refund.service';

export interface CaptureInfo {
  amountMinor?: number;
  currency?: string;
  providerTransactionId?: string;
  raw?: unknown;
  source: 'webhook' | 'reconciliation';
}

export class PaymentService {
  private refunds?: RefundService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly env: Env,
    private readonly registry: PaymentProviderRegistry,
    private readonly orderState: OrderStateService,
    private readonly fulfillment: FulfillmentQueueService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
    private readonly logger: Logger,
  ) {}

  setRefundService(refunds: RefundService) {
    this.refunds = refunds;
  }

  /** Create (or reuse) a pending payment for an order awaiting payment. */
  async createPaymentForOrder(orderId: string, userId: string): Promise<Payment> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { user: true } });
    if (!order || order.userId !== userId) throw notFound('Order');
    if (order.status !== 'AWAITING_PAYMENT') throw conflict(`Order is ${order.status}; payment is not possible`, 'ORDER_NOT_PAYABLE');
    if (order.expiresAt && order.expiresAt < new Date()) throw conflict('This order has expired', 'ORDER_EXPIRED');

    const existing = await this.prisma.payment.findFirst({
      where: { orderId, status: 'PENDING', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (existing?.checkoutUrl) return existing;

    const provider = this.registry.default();
    const payment = await this.prisma.payment.create({
      data: {
        orderId,
        provider: provider.code,
        amountMinor: order.totalMinor,
        currency: order.currency,
        expiresAt: order.expiresAt ?? new Date(Date.now() + this.env.ORDER_PAYMENT_TTL_MINUTES * 60_000),
      },
    });
    try {
      const created = await provider.createPayment({
        paymentId: payment.id,
        orderId,
        orderNumber: order.orderNumber,
        amountMinor: order.totalMinor,
        currency: order.currency,
        description: `Order ${order.orderNumber}`,
        customerEmail: order.user.email,
      });
      return await this.prisma.payment.update({
        where: { id: payment.id },
        data: { providerPaymentId: created.providerPaymentId, checkoutUrl: created.checkoutUrl },
      });
    } catch (err) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', failureReason: `create failed: ${(err as Error).message}` },
      });
      throw err;
    }
  }

  /**
   * Verify, de-duplicate and apply a payment provider webhook.
   * Returns a small status object; throws WebhookVerificationError for bad signatures.
   */
  async handleWebhook(providerCode: string, rawBody: Buffer, headers: WebhookHeaders) {
    const provider = this.registry.get(providerCode);
    let event: PaymentWebhookEvent;
    try {
      event = provider.verifyWebhook(rawBody, headers);
    } catch (err) {
      if (err instanceof WebhookVerificationError) {
        await this.audit.log({
          action: 'webhook.rejected',
          entityType: 'WebhookEvent',
          metadata: { provider: providerCode, reason: err.message },
        });
        this.logger.warn({ provider: providerCode, reason: err.message }, 'webhook rejected');
      }
      throw err;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Unique (provider, eventId) makes duplicate deliveries a no-op (replay protection).
        const stored = await tx.webhookEvent.create({
          data: {
            provider: providerCode,
            eventId: event.eventId,
            eventType: event.type,
            signatureValid: true,
            payload: redact(event.raw) as Prisma.InputJsonValue,
          },
        });
        const result = await this.applyEvent(tx, providerCode, event);
        await tx.webhookEvent.update({
          where: { id: stored.id },
          data: { status: result.applied ? 'PROCESSED' : 'IGNORED', error: result.note, processedAt: new Date() },
        });
        return { duplicate: false, ...result };
      }).then(async (r) => {
        await this.afterCommit(r.followUp);
        return { duplicate: r.duplicate, applied: r.applied, note: r.note };
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        this.logger.info({ provider: providerCode, eventId: event.eventId }, 'duplicate webhook ignored');
        return { duplicate: true, applied: false, note: 'duplicate event' };
      }
      throw err;
    }
  }

  private async applyEvent(tx: Prisma.TransactionClient, providerCode: string, event: PaymentWebhookEvent) {
    const payment = await tx.payment.findUnique({
      where: { provider_providerPaymentId: { provider: providerCode, providerPaymentId: event.providerPaymentId } },
    });
    if (!payment) return { applied: false, note: 'unknown payment', followUp: undefined };
    switch (event.type) {
      case 'payment.succeeded':
        return this.applyCapture(tx, payment, {
          amountMinor: event.amountMinor,
          currency: event.currency,
          providerTransactionId: event.providerTransactionId,
          raw: event.raw,
          source: 'webhook',
        });
      case 'payment.failed':
        return this.applyFailure(tx, payment, event.failureReason ?? 'payment failed');
      case 'refund.succeeded':
      case 'refund.failed':
        if (!this.refunds) return { applied: false, note: 'refund service unavailable', followUp: undefined };
        return {
          ...(await this.refunds.applyRefundEvent(tx, payment, event)),
          followUp: undefined,
        };
      default:
        return { applied: false, note: `unhandled event type ${event.type}`, followUp: undefined };
    }
  }

  /**
   * Idempotent capture. Uses compare-and-swap on payment.status so a webhook and a
   * reconciliation running at the same time cannot both apply it.
   */
  async applyCapture(tx: Prisma.TransactionClient, payment: Payment, info: CaptureInfo) {
    const swapped = await tx.payment.updateMany({
      where: { id: payment.id, status: { in: ['PENDING', 'EXPIRED', 'FAILED'] } },
      data: { status: 'SUCCEEDED', paidAt: new Date(), failureReason: null },
    });
    if (swapped.count !== 1) return { applied: false, note: 'payment already finalised', followUp: undefined };

    await tx.paymentTransaction.create({
      data: {
        paymentId: payment.id,
        type: 'CHARGE',
        status: 'SUCCEEDED',
        amountMinor: info.amountMinor ?? payment.amountMinor,
        currency: info.currency ?? payment.currency,
        providerTransactionId: info.providerTransactionId ?? `capture-${payment.id}`,
        rawPayload: info.raw === undefined ? undefined : (redact(info.raw) as Prisma.InputJsonValue),
      },
    });

    const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } });
    const otherCaptured = await tx.payment.count({
      where: { orderId: order.id, status: 'SUCCEEDED', id: { not: payment.id } },
    });

    // Money arrived for an order that can no longer be paid (expired/cancelled) or was paid twice.
    if (order.status !== 'AWAITING_PAYMENT' || otherCaptured > 0) {
      const reason = otherCaptured > 0 ? 'duplicate payment for order' : `late payment for ${order.status} order`;
      this.logger.warn({ orderId: order.id, paymentId: payment.id, reason }, 'auto-refunding unexpected capture');
      return { applied: true, note: reason, followUp: { kind: 'refund' as const, paymentId: payment.id, reason } };
    }

    const amountOk = (info.amountMinor ?? payment.amountMinor) === order.totalMinor;
    const currencyOk = (info.currency ?? payment.currency).toUpperCase() === order.currency.toUpperCase();
    if (!amountOk || !currencyOk) {
      await this.orderState.transition(tx, order.id, 'MANUAL_REVIEW', {
        message: `Payment amount mismatch (got ${info.amountMinor} ${info.currency}, expected ${order.totalMinor} ${order.currency})`,
        data: { failureReason: 'Payment amount mismatch' },
      });
      return { applied: true, note: 'amount mismatch: manual review', followUp: undefined };
    }

    await this.orderState.transition(tx, order.id, 'PAID', {
      message: `Payment confirmed via ${info.source}`,
      data: { paidAt: new Date() },
    });
    await this.orderState.transition(tx, order.id, 'QUEUED', { message: 'Queued for delivery' });
    await tx.payment.updateMany({
      where: { orderId: order.id, status: 'PENDING', id: { not: payment.id } },
      data: { status: 'CANCELLED' },
    });
    await this.notifications.notify(
      {
        userId: order.userId,
        type: 'payment.succeeded',
        title: `Payment received for ${order.orderNumber}`,
        body: 'Your payment was confirmed. Delivery has started.',
        link: `/orders/${order.id}`,
      },
      tx,
    );
    return { applied: true, note: undefined, followUp: { kind: 'fulfill' as const, orderId: order.id } };
  }

  private async applyFailure(tx: Prisma.TransactionClient, payment: Payment, reason: string) {
    const swapped = await tx.payment.updateMany({
      where: { id: payment.id, status: 'PENDING' },
      data: { status: 'FAILED', failureReason: reason },
    });
    if (swapped.count !== 1) return { applied: false, note: 'payment already finalised', followUp: undefined };
    const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } });
    await tx.orderEvent.create({
      data: { orderId: order.id, fromStatus: order.status, toStatus: order.status, message: `Payment failed: ${reason}` },
    });
    await this.notifications.notify(
      {
        userId: order.userId,
        type: 'payment.failed',
        title: `Payment failed for ${order.orderNumber}`,
        body: 'Your payment did not go through. You can try again from the order page.',
        link: `/orders/${order.id}`,
      },
      tx,
    );
    return { applied: true, note: undefined, followUp: undefined };
  }

  private async afterCommit(
    followUp: { kind: 'fulfill'; orderId: string } | { kind: 'refund'; paymentId: string; reason: string } | undefined,
  ) {
    if (!followUp) return;
    if (followUp.kind === 'fulfill') {
      await this.fulfillment.enqueueFulfillment(followUp.orderId);
    } else if (this.refunds) {
      try {
        await this.refunds.refundUnexpectedCapture(followUp.paymentId, followUp.reason);
      } catch (err) {
        this.logger.error({ err, paymentId: followUp.paymentId }, 'automatic refund failed');
      }
    }
  }

  /**
   * Ask the gateway about payments that have been pending for a while. Recovers from
   * lost/late webhooks. Safe to run concurrently with webhooks thanks to applyCapture's CAS.
   */
  async reconcilePendingPayments(olderThanMs = 2 * 60_000): Promise<number> {
    const pending = await this.prisma.payment.findMany({
      where: { status: 'PENDING', providerPaymentId: { not: null }, createdAt: { lt: new Date(Date.now() - olderThanMs) } },
      take: 100,
    });
    let changed = 0;
    for (const p of pending) {
      if (await this.reconcilePayment(p.id)) changed++;
    }
    return changed;
  }

  async reconcilePayment(paymentId: string): Promise<boolean> {
    const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    if (!payment.providerPaymentId || !this.registry.has(payment.provider)) return false;
    const provider = this.registry.get(payment.provider);
    const status = await provider.getPaymentStatus(payment.providerPaymentId);
    if (status.status === 'SUCCEEDED') {
      const r = await this.prisma.$transaction((tx) =>
        this.applyCapture(tx, payment, {
          amountMinor: status.amountMinor,
          currency: status.currency,
          providerTransactionId: status.providerTransactionId,
          source: 'reconciliation',
        }),
      );
      await this.afterCommit(r.followUp);
      return r.applied;
    }
    if (status.status === 'FAILED') {
      const r = await this.prisma.$transaction((tx) => this.applyFailure(tx, payment, 'reported failed by gateway'));
      return r.applied;
    }
    return false;
  }

  /** Cancel unpaid orders past their payment window (after a final check with the gateway). */
  async expireUnpaidOrders(): Promise<number> {
    const stale = await this.prisma.order.findMany({
      where: { status: 'AWAITING_PAYMENT', expiresAt: { lt: new Date() } },
      include: { payments: { where: { status: 'PENDING' } } },
      take: 100,
    });
    let expired = 0;
    for (const order of stale) {
      for (const p of order.payments) {
        try {
          await this.reconcilePayment(p.id);
        } catch (err) {
          this.logger.warn({ err, paymentId: p.id }, 'payment check before expiry failed');
        }
      }
      const done = await this.prisma.$transaction(async (tx) => {
        const moved = await this.orderState.tryTransition(tx, order.id, 'CANCELLED', {
          from: ['AWAITING_PAYMENT'],
          message: 'Payment window expired',
        });
        if (!moved) return false;
        await tx.payment.updateMany({ where: { orderId: order.id, status: 'PENDING' }, data: { status: 'EXPIRED' } });
        await this.releasePromotion(tx, order.id);
        return true;
      });
      if (done) expired++;
    }
    return expired;
  }

  async cancelByCustomer(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.userId !== userId) throw notFound('Order');
    if (order.status !== 'AWAITING_PAYMENT' && order.status !== 'CREATED') {
      throw unprocessable('Only unpaid orders can be cancelled', 'ORDER_NOT_CANCELLABLE');
    }
    // Make sure the customer has not actually paid already.
    const pending = await this.prisma.payment.findMany({ where: { orderId, status: 'PENDING' } });
    for (const p of pending) await this.reconcilePayment(p.id).catch(() => false);
    await this.prisma.$transaction(async (tx) => {
      await this.orderState.transition(tx, orderId, 'CANCELLED', {
        from: ['AWAITING_PAYMENT', 'CREATED'],
        message: 'Cancelled by customer',
        actorId: userId,
      });
      await tx.payment.updateMany({ where: { orderId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
      await this.releasePromotion(tx, orderId);
    });
  }

  private async releasePromotion(tx: Prisma.TransactionClient, orderId: string) {
    const redemption = await tx.promotionRedemption.findUnique({ where: { orderId } });
    if (!redemption) return;
    await tx.promotionRedemption.delete({ where: { id: redemption.id } });
    await tx.promotion.updateMany({
      where: { id: redemption.promotionId, redemptionCount: { gt: 0 } },
      data: { redemptionCount: { decrement: 1 } },
    });
  }
}
