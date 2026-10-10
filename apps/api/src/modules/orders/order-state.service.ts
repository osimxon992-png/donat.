import type { Prisma, PrismaClient } from '@prisma/client';
import { canTransition, type OrderStatus } from '@donat/shared';
import { AppError, notFound } from '../../lib/errors';

export type Db = PrismaClient | Prisma.TransactionClient;

export class InvalidTransitionError extends AppError {
  constructor(from: OrderStatus, to: OrderStatus) {
    super(409, 'INVALID_TRANSITION', `Order cannot move from ${from} to ${to}`);
  }
}

export class ConcurrentUpdateError extends AppError {
  constructor() {
    super(409, 'CONCURRENT_UPDATE', 'The order was modified concurrently; please retry');
  }
}

export interface TransitionOptions {
  /** Only transition if the order is currently in one of these states. */
  from?: readonly OrderStatus[];
  message?: string;
  actorId?: string | null;
  data?: Prisma.OrderUncheckedUpdateManyInput;
}

/**
 * The single place where order status changes. Every change:
 *   1. is validated against the state machine in @donat/shared,
 *   2. is applied with compare-and-swap (`WHERE status = <current>`) so concurrent
 *      workers/webhooks cannot both win,
 *   3. is recorded as an OrderEvent.
 */
export class OrderStateService {
  async transition(db: Db, orderId: string, to: OrderStatus, opts: TransitionOptions = {}): Promise<OrderStatus> {
    const order = await db.order.findUnique({ where: { id: orderId }, select: { status: true } });
    if (!order) throw notFound('Order');
    const from = order.status as OrderStatus;
    if (opts.from && !opts.from.includes(from)) throw new InvalidTransitionError(from, to);
    if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
    const res = await db.order.updateMany({ where: { id: orderId, status: from }, data: { ...opts.data, status: to } });
    if (res.count !== 1) throw new ConcurrentUpdateError();
    await db.orderEvent.create({
      data: { orderId, fromStatus: from, toStatus: to, message: opts.message, actorId: opts.actorId ?? null },
    });
    return from;
  }

  /** Like transition() but returns false instead of throwing when the CAS or state check fails. */
  async tryTransition(db: Db, orderId: string, to: OrderStatus, opts: TransitionOptions = {}): Promise<boolean> {
    try {
      await this.transition(db, orderId, to, opts);
      return true;
    } catch (err) {
      if (err instanceof InvalidTransitionError || err instanceof ConcurrentUpdateError) return false;
      throw err;
    }
  }
}
