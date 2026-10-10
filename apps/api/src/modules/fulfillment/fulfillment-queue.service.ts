import type { Prisma, PrismaClient } from '@prisma/client';
import type { Env } from '../../config/env';
import type { Logger } from '../../lib/logger';
import type { JobData, JobName, JobQueue } from '../../queue/queue';
import type { NotificationService } from '../notifications/notification.service';
import type { OrderStateService } from '../orders/order-state.service';
import type { OrderReconciliationService } from './order-reconciliation.service';
import type { ProviderManagerService, SelectedProvider } from './provider-manager.service';
import { ProviderNotAvailableError, type TopUpRequest, type TopUpResult } from './topup-provider';

export interface FulfillmentTiming {
  /** Base delay for retry backoff (attempt n waits base * 2^(n-1)). */
  retryBaseDelayMs: number;
  /** Delay before reconciling an attempt with an unknown outcome. */
  reconcileDelayMs: number;
}

/**
 * Turns PAID orders into delivered top-ups.
 *
 * Duplicate-delivery protection, in layers:
 *   1. Queue jobs are de-duplicated by jobId (best effort only).
 *   2. A worker must win the QUEUED -> PROCESSING compare-and-swap before calling a supplier,
 *      so two workers processing the same job cannot both proceed.
 *   3. A FulfillmentAttempt row (unique per order + attempt number) is committed BEFORE the
 *      supplier is called, so a crash mid-call leaves evidence that triggers reconciliation.
 *   4. No new attempt is ever made while an earlier attempt is unresolved (PENDING/UNKNOWN):
 *      we reconcile with the supplier first.
 */
export class FulfillmentQueueService {
  private reconciliation?: OrderReconciliationService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly env: Env,
    private readonly queue: JobQueue,
    private readonly providers: ProviderManagerService,
    private readonly orderState: OrderStateService,
    private readonly notifications: NotificationService,
    private readonly logger: Logger,
    private readonly timing: FulfillmentTiming = { retryBaseDelayMs: 5_000, reconcileDelayMs: 15_000 },
  ) {}

  setReconciliation(service: OrderReconciliationService) {
    this.reconciliation = service;
  }

  async enqueueFulfillment(orderId: string, delayMs = 0): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { fulfillmentCount: true } });
    if (!order) return;
    await this.queue.add('fulfill-order', { orderId }, { jobId: `fulfill-${orderId}-${order.fulfillmentCount + 1}`, delayMs });
  }

  async enqueueReconcile(orderId: string, delayMs = this.timing.reconcileDelayMs): Promise<void> {
    await this.queue.add('reconcile-order', { orderId }, { jobId: `reconcile-${orderId}-${Date.now()}`, delayMs });
  }

  /** Queue worker entry point. */
  async handleJob(name: JobName, data: JobData): Promise<void> {
    if (name === 'fulfill-order') return this.processOrder(data.orderId);
    if (name === 'reconcile-order') {
      if (!this.reconciliation) throw new Error('reconciliation service not wired');
      await this.reconciliation.reconcileOrder(data.orderId);
    }
  }

  async processOrder(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, game: true, attempts: { orderBy: { attemptNumber: 'desc' } } },
    });
    if (!order) return;
    if (order.status !== 'QUEUED') {
      this.logger.debug({ orderId, status: order.status }, 'skip fulfillment: order not QUEUED');
      return;
    }
    const unresolved = order.attempts.find((a) => a.status === 'PENDING' || a.status === 'UNKNOWN');
    if (unresolved) {
      // Never retry over an unresolved attempt: reconcile first.
      this.logger.warn({ orderId, attemptId: unresolved.id }, 'unresolved attempt exists; reconciling before retry');
      await this.orderState.tryTransition(this.prisma, orderId, 'PROCESSING', {
        from: ['QUEUED'],
        message: 'Reconciling previous attempt',
      });
      await this.enqueueReconcile(orderId, 0);
      return;
    }

    const item = order.items[0];
    if (!item) {
      await this.orderState.tryTransition(this.prisma, orderId, 'MANUAL_REVIEW', { message: 'Order has no items' });
      return;
    }

    let selected: SelectedProvider;
    try {
      selected = await this.providers.selectForProduct(item.productId);
    } catch (err) {
      if (err instanceof ProviderNotAvailableError) {
        await this.prisma.$transaction(async (tx) => {
          const moved = await this.orderState.tryTransition(tx, orderId, 'MANUAL_REVIEW', {
            from: ['QUEUED'],
            message: `No provider available: ${err.message}`,
            data: { failureReason: err.message },
          });
          if (moved) await this.notifyStaffNeeded(tx, order.userId, order.orderNumber, orderId);
        });
        return;
      }
      throw err;
    }

    const attemptNumber = (order.attempts[0]?.attemptNumber ?? 0) + 1;
    const request: TopUpRequest = {
      externalReference: `${order.orderNumber}-A${attemptNumber}`,
      orderNumber: order.orderNumber,
      gameSlug: order.game.slug,
      providerSku: selected.mapping.providerSku,
      playerId: order.playerId,
      serverId: order.serverId || undefined,
      quantity: item.quantity,
      expectedCostMinor: selected.mapping.costMinor * item.quantity,
      currency: selected.mapping.currency,
    };

    // Claim the order and record the attempt atomically, BEFORE talking to the supplier.
    let attemptId: string;
    try {
      attemptId = await this.prisma.$transaction(async (tx) => {
        await this.orderState.transition(tx, orderId, 'PROCESSING', {
          from: ['QUEUED'],
          message: `Delivery attempt ${attemptNumber} via ${selected.record.code}`,
          data: { providerId: selected.record.id, fulfillmentCount: { increment: 1 } },
        });
        const attempt = await tx.fulfillmentAttempt.create({
          data: {
            orderId,
            attemptNumber,
            providerId: selected.record.id,
            externalReference: request.externalReference,
            requestPayload: request as unknown as Prisma.InputJsonValue,
          },
        });
        return attempt.id;
      });
    } catch (err) {
      // Another worker won the race (CAS failed or unique attempt number violated).
      this.logger.info({ orderId, err: (err as Error).message }, 'fulfillment claim lost; skipping');
      return;
    }

    const start = Date.now();
    let result: TopUpResult;
    try {
      result = await this.providers.call(
        selected.record,
        'topUp',
        orderId,
        request,
        () => selected.client.topUp(request),
        (r) => r.outcome === 'UNKNOWN' || (r.outcome === 'FAILED' && r.retryable),
      );
    } catch (err) {
      result = { outcome: 'UNKNOWN', code: 'ADAPTER_ERROR', message: (err as Error).message };
    }
    await this.applyResult(orderId, attemptId, attemptNumber, result, Date.now() - start);
  }

  private async applyResult(orderId: string, attemptId: string, attemptNumber: number, result: TopUpResult, durationMs: number) {
    const finishedAt = new Date();
    if (result.outcome === 'SUCCESS') {
      await this.prisma.$transaction(async (tx) => {
        await tx.fulfillmentAttempt.update({
          where: { id: attemptId },
          data: { status: 'SUCCEEDED', supplierOrderId: result.supplierOrderId, responsePayload: toJson(result), durationMs, finishedAt },
        });
        await this.markFulfilled(tx, orderId, `Delivered (supplier ref ${result.supplierOrderId})`);
      });
      return;
    }

    if (result.outcome === 'UNKNOWN') {
      await this.prisma.fulfillmentAttempt.update({
        where: { id: attemptId },
        data: { status: 'UNKNOWN', errorCode: result.code, errorMessage: result.message, responsePayload: toJson(result), durationMs, finishedAt },
      });
      await this.prisma.orderEvent.create({
        data: { orderId, toStatus: 'PROCESSING', fromStatus: 'PROCESSING', message: `Outcome unknown (${result.code}); reconciling with supplier` },
      });
      await this.enqueueReconcile(orderId);
      return;
    }

    // Definite failure: nothing was delivered.
    await this.prisma.fulfillmentAttempt.update({
      where: { id: attemptId },
      data: { status: 'FAILED', errorCode: result.code, errorMessage: result.message, responsePayload: toJson(result), durationMs, finishedAt },
    });
    await this.afterDefiniteFailure(orderId, attemptNumber, result.retryable, `${result.code}: ${result.message}`);
  }

  /** Shared by the worker and reconciliation once the latest attempt is known to have failed. */
  async afterDefiniteFailure(orderId: string, attemptNumber: number, retryable: boolean, reason: string) {
    if (retryable && attemptNumber < this.env.FULFILLMENT_MAX_ATTEMPTS) {
      const moved = await this.orderState.tryTransition(this.prisma, orderId, 'QUEUED', {
        from: ['PROCESSING'],
        message: `Attempt ${attemptNumber} failed (${reason}); retrying`,
      });
      if (moved) await this.enqueueFulfillment(orderId, this.timing.retryBaseDelayMs * 2 ** (attemptNumber - 1));
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      const moved = await this.orderState.tryTransition(tx, orderId, 'FAILED', {
        from: ['PROCESSING', 'MANUAL_REVIEW'],
        message: `Delivery failed: ${reason}`,
        data: { failureReason: reason },
      });
      if (moved) {
        await this.notifications.notify(
          {
            userId: order.userId,
            type: 'order.failed',
            title: `Order ${order.orderNumber} could not be delivered`,
            body: 'We could not deliver your top-up. Our team has been notified and will refund you or contact you shortly.',
            link: `/orders/${orderId}`,
          },
          tx,
        );
      }
    });
  }

  async markFulfilled(tx: Prisma.TransactionClient, orderId: string, message: string, actorId?: string) {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { game: true, items: true } });
    await this.orderState.transition(tx, orderId, 'FULFILLED', {
      from: ['PROCESSING', 'MANUAL_REVIEW'],
      message,
      actorId,
      data: { fulfilledAt: new Date(), failureReason: null },
    });
    const item = order.items[0];
    await this.notifications.notify(
      {
        userId: order.userId,
        type: 'order.fulfilled',
        title: `Order ${order.orderNumber} delivered`,
        body: `${item?.productName ?? 'Your top-up'} was delivered to ${order.game.name} player ${order.playerId}.`,
        link: `/orders/${orderId}`,
      },
      tx,
    );
  }

  private async notifyStaffNeeded(tx: Prisma.TransactionClient, userId: string, orderNumber: string, orderId: string) {
    await this.notifications.notify(
      {
        userId,
        type: 'order.review',
        title: `Order ${orderNumber} is being reviewed`,
        body: 'Your payment is safe. Delivery needs a manual check by our team; we will update you shortly.',
        link: `/orders/${orderId}`,
      },
      tx,
    );
  }
}

function toJson(v: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;
}
