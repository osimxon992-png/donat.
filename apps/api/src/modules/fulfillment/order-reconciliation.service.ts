import type { FulfillmentAttempt, Prisma, PrismaClient } from '@prisma/client';
import type { Env } from '../../config/env';
import type { Logger } from '../../lib/logger';
import type { OrderStateService } from '../orders/order-state.service';
import type { FulfillmentQueueService } from './fulfillment-queue.service';
import type { ProviderManagerService } from './provider-manager.service';
import type { SupplierOrderStatus } from './topup-provider';

export interface ReconcileSummary {
  orderId: string;
  outcome: 'FULFILLED' | 'RETRY_SCHEDULED' | 'FAILED' | 'PENDING' | 'MANUAL_REVIEW' | 'NOTHING_TO_DO';
  details: string[];
}

/**
 * Resolves fulfillment attempts whose outcome is unknown (timeouts, crashes, lost responses)
 * by asking the supplier, using the attempt's externalReference. Only when the supplier
 * confirms the attempt failed or never arrived is a new attempt allowed.
 */
export class OrderReconciliationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly env: Env,
    private readonly providers: ProviderManagerService,
    private readonly fulfillment: FulfillmentQueueService,
    private readonly orderState: OrderStateService,
    private readonly logger: Logger,
    /** NOT_FOUND is only trusted once an attempt is older than this (supplier eventual consistency). */
    private readonly notFoundSettleMs = 60_000,
  ) {}

  async reconcileOrder(orderId: string, actorId?: string): Promise<ReconcileSummary> {
    const details: string[] = [];
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { attempts: { orderBy: { attemptNumber: 'asc' }, include: { provider: true } } },
    });
    if (!order) return { orderId, outcome: 'NOTHING_TO_DO', details: ['order not found'] };
    if (!['PROCESSING', 'MANUAL_REVIEW'].includes(order.status)) {
      return { orderId, outcome: 'NOTHING_TO_DO', details: [`order is ${order.status}`] };
    }

    const unresolved = order.attempts.filter((a) => a.status === 'PENDING' || a.status === 'UNKNOWN');
    let stillPending = false;

    for (const attempt of unresolved) {
      let status: SupplierOrderStatus;
      try {
        const client = this.providers.getClient(attempt.provider);
        status = await this.providers.call(attempt.provider, 'getOrderStatus', orderId, { externalReference: attempt.externalReference }, () =>
          client.getOrderStatus(attempt.externalReference),
        );
      } catch (err) {
        details.push(`attempt ${attempt.attemptNumber}: supplier query failed (${(err as Error).message})`);
        stillPending = true;
        await this.bumpChecks(attempt);
        continue;
      }

      if (status.status === 'SUCCESS') {
        await this.prisma.$transaction(async (tx) => {
          await tx.fulfillmentAttempt.update({
            where: { id: attempt.id },
            data: { status: 'SUCCEEDED', supplierOrderId: status.supplierOrderId, reconciledAt: new Date(), finishedAt: attempt.finishedAt ?? new Date() },
          });
          await this.fulfillment.markFulfilled(
            tx,
            orderId,
            `Reconciled: supplier confirmed delivery (ref ${status.supplierOrderId ?? attempt.externalReference})`,
            actorId,
          );
        });
        details.push(`attempt ${attempt.attemptNumber}: supplier confirmed SUCCESS`);
        return { orderId, outcome: 'FULFILLED', details };
      }

      const settled = Date.now() - attempt.startedAt.getTime() >= this.notFoundSettleMs;
      if (status.status === 'FAILED' || (status.status === 'NOT_FOUND' && settled)) {
        await this.prisma.fulfillmentAttempt.update({
          where: { id: attempt.id },
          data: {
            status: 'FAILED',
            errorCode: status.status === 'NOT_FOUND' ? 'NOT_RECEIVED_BY_SUPPLIER' : attempt.errorCode ?? 'SUPPLIER_FAILED',
            errorMessage: status.message ?? attempt.errorMessage,
            reconciledAt: new Date(),
            finishedAt: attempt.finishedAt ?? new Date(),
          },
        });
        details.push(`attempt ${attempt.attemptNumber}: supplier reports ${status.status}`);
        continue;
      }

      // PENDING at supplier, or NOT_FOUND too soon to trust.
      details.push(`attempt ${attempt.attemptNumber}: supplier reports ${status.status}; will check again`);
      stillPending = true;
      await this.bumpChecks(attempt);
    }

    if (stillPending) {
      const maxChecks = Math.max(...unresolved.map((a) => a.reconcileChecks + 1));
      if (maxChecks >= this.env.RECONCILE_MAX_CHECKS) {
        await this.orderState.tryTransition(this.prisma, orderId, 'MANUAL_REVIEW', {
          from: ['PROCESSING'],
          message: 'Supplier outcome still unknown after repeated checks; manual review required',
          data: { failureReason: 'Unresolved supplier outcome' },
        });
        return { orderId, outcome: 'MANUAL_REVIEW', details };
      }
      if (order.status === 'PROCESSING') await this.fulfillment.enqueueReconcile(orderId);
      return { orderId, outcome: 'PENDING', details };
    }

    // Every attempt is resolved and none succeeded.
    if (order.status === 'MANUAL_REVIEW') {
      details.push('all attempts resolved as not delivered; an admin may retry or refund');
      return { orderId, outcome: 'MANUAL_REVIEW', details };
    }
    const last = order.attempts.at(-1);
    const lastNumber = last?.attemptNumber ?? 0;
    await this.fulfillment.afterDefiniteFailure(orderId, lastNumber, true, 'previous attempt was not delivered');
    const after = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
    return { orderId, outcome: after.status === 'QUEUED' ? 'RETRY_SCHEDULED' : 'FAILED', details };
  }

  private async bumpChecks(attempt: FulfillmentAttempt) {
    await this.prisma.fulfillmentAttempt.update({
      where: { id: attempt.id },
      data: { reconcileChecks: { increment: 1 } },
    });
  }

  /**
   * Safety sweep (run by the scheduler): finds orders stuck mid-flight — e.g. the process
   * crashed between claiming an order and recording the supplier response, or an in-memory
   * job was lost on restart — and routes them back through reconciliation or the queue.
   */
  async sweepStuckOrders(olderThanMs = 5 * 60_000): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMs);
    let count = 0;

    const processing = await this.prisma.order.findMany({
      where: { status: 'PROCESSING', updatedAt: { lt: cutoff } },
      select: { id: true },
      take: 100,
    });
    for (const o of processing) {
      await this.prisma.fulfillmentAttempt.updateMany({
        where: { orderId: o.id, status: 'PENDING', startedAt: { lt: cutoff } },
        data: { status: 'UNKNOWN', errorCode: 'WORKER_INTERRUPTED', errorMessage: 'Worker stopped before recording the outcome' },
      });
      await this.fulfillment.enqueueReconcile(o.id, 0);
      count++;
    }

    const queued = await this.prisma.order.findMany({
      where: { status: { in: ['QUEUED', 'PAID'] }, updatedAt: { lt: new Date(Date.now() - 2 * 60_000) } },
      select: { id: true, status: true },
      take: 100,
    });
    for (const o of queued) {
      if (o.status === 'PAID') {
        const moved = await this.orderState.tryTransition(this.prisma, o.id, 'QUEUED', { from: ['PAID'], message: 'Re-queued by sweeper' });
        if (!moved) continue;
      } else {
        // Touch updatedAt so the same order is not re-enqueued every sweep.
        await this.prisma.order.updateMany({ where: { id: o.id, status: 'QUEUED' }, data: { updatedAt: new Date() } as Prisma.OrderUpdateManyMutationInput });
      }
      await this.fulfillment.enqueueFulfillment(o.id);
      count++;
    }
    if (count) this.logger.info({ count }, 'sweeper re-routed stuck orders');
    return count;
  }
}
