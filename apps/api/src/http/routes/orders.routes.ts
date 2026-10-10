import { checkoutSchema, ORDER_STATUSES, ORDER_STATUS_LABELS, type OrderStatus } from '@donat/shared';
import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '../../container';
import { forbidden, notFound } from '../../lib/errors';
import { paged, pagination, param, parse, str } from '../../lib/validate';
import { clientInfo, type AuthMiddleware } from '../auth-middleware';
import { rateLimit } from '../rate-limit';

const orderInclude = {
  game: { select: { name: true, slug: true, imageUrl: true, currencyName: true, playerIdLabel: true } },
  items: true,
  events: { orderBy: { createdAt: 'asc' as const } },
  payments: { orderBy: { createdAt: 'desc' as const } },
  refunds: { orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.OrderInclude;

type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

/** Customer-safe projection: no costs, supplier data or internal errors. */
export function presentOrderForCustomer(o: OrderWithRelations) {
  const status = o.status as OrderStatus;
  const pendingPayment = o.payments.find((p) => p.status === 'PENDING' && p.expiresAt > new Date());
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status,
    statusLabel: ORDER_STATUS_LABELS[status],
    currency: o.currency,
    subtotalMinor: o.subtotalMinor,
    discountMinor: o.discountMinor,
    totalMinor: o.totalMinor,
    playerId: o.playerId,
    serverId: o.serverId,
    playerNickname: o.playerNickname,
    game: o.game,
    items: o.items.map((i) => ({ productName: i.productName, quantity: i.quantity, unitPriceMinor: i.unitPriceMinor, totalMinor: i.totalMinor })),
    timeline: o.events.map((e) => ({
      status: e.toStatus,
      label: ORDER_STATUS_LABELS[e.toStatus as OrderStatus],
      message: e.fromStatus === e.toStatus ? e.message : customerMessage(e.toStatus as OrderStatus, e.message),
      at: e.createdAt,
    })),
    payments: o.payments.map((p) => ({
      id: p.id,
      provider: p.provider,
      status: p.status,
      amountMinor: p.amountMinor,
      currency: p.currency,
      createdAt: p.createdAt,
      paidAt: p.paidAt,
    })),
    refunds: o.refunds.map((r) => ({ status: r.status, amountMinor: r.amountMinor, currency: r.currency, createdAt: r.createdAt })),
    checkoutUrl: pendingPayment?.checkoutUrl ?? null,
    canPay: status === 'AWAITING_PAYMENT' && (!o.expiresAt || o.expiresAt > new Date()),
    canCancel: status === 'AWAITING_PAYMENT' || status === 'CREATED',
    expiresAt: o.expiresAt,
    createdAt: o.createdAt,
    paidAt: o.paidAt,
    fulfilledAt: o.fulfilledAt,
  };
}

function customerMessage(status: OrderStatus, message: string | null): string | null {
  // Internal messages may include supplier codes; show neutral text for sensitive states.
  if (status === 'MANUAL_REVIEW') return 'Our team is checking your delivery.';
  if (status === 'FAILED') return 'Delivery could not be completed.';
  if (status === 'PROCESSING') return 'Delivering to your account.';
  return message;
}

export function orderRoutes(c: Container, mw: AuthMiddleware) {
  const r = Router();
  r.use(mw.requireAuth);
  const checkoutLimiter = rateLimit({
    store: c.rateLimitStore,
    windowMs: 60_000,
    max: 20,
    prefix: 'checkout',
    key: (req) => req.auth?.userId ?? req.ip ?? 'anon',
  });

  r.post('/', checkoutLimiter, async (req, res) => {
    const input = parse(checkoutSchema, req.body);
    const result = await c.checkout.createOrder(req.auth!.userId, input, req.header('Idempotency-Key'), clientInfo(req));
    const order = await c.prisma.order.findUniqueOrThrow({ where: { id: result.order.id }, include: orderInclude });
    res.status(result.replayed ? 200 : 201).json({
      order: presentOrderForCustomer(order),
      payment: result.payment ? { id: result.payment.id, status: result.payment.status, checkoutUrl: result.payment.checkoutUrl } : null,
      replayed: result.replayed,
    });
  });

  r.get('/', async (req, res) => {
    const p = pagination(req.query as Record<string, unknown>, 50);
    const status = str(req.query.status);
    const where: Prisma.OrderWhereInput = {
      userId: req.auth!.userId,
      ...(status && (ORDER_STATUSES as readonly string[]).includes(status) ? { status: status as OrderStatus } : {}),
    };
    const [items, total] = await c.prisma.$transaction([
      c.prisma.order.findMany({ where, include: orderInclude, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take }),
      c.prisma.order.count({ where }),
    ]);
    res.json(paged(items.map(presentOrderForCustomer), total, p));
  });

  r.get('/:id', async (req, res) => {
    const order = await c.prisma.order.findUnique({ where: { id: param(req, 'id') }, include: orderInclude });
    if (!order || order.userId !== req.auth!.userId) throw notFound('Order');
    res.json({ order: presentOrderForCustomer(order) });
  });

  r.post('/:id/pay', async (req, res) => {
    const payment = await c.payments.createPaymentForOrder(param(req, 'id'), req.auth!.userId);
    res.json({ payment: { id: payment.id, status: payment.status, checkoutUrl: payment.checkoutUrl } });
  });

  r.post('/:id/cancel', async (req, res) => {
    await c.payments.cancelByCustomer(param(req, 'id'), req.auth!.userId);
    res.json({ ok: true });
  });

  return r;
}

export function paymentRoutes(c: Container, mw: AuthMiddleware) {
  const r = Router();
  r.use(mw.requireAuth);

  r.get('/', async (req, res) => {
    const p = pagination(req.query as Record<string, unknown>, 50);
    const where: Prisma.PaymentWhereInput = { order: { userId: req.auth!.userId } };
    const [items, total] = await c.prisma.$transaction([
      c.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: p.skip,
        take: p.take,
        include: { order: { select: { id: true, orderNumber: true } }, refunds: { select: { status: true, amountMinor: true } } },
      }),
      c.prisma.payment.count({ where }),
    ]);
    res.json(
      paged(
        items.map((x) => ({
          id: x.id,
          provider: x.provider,
          status: x.status,
          amountMinor: x.amountMinor,
          currency: x.currency,
          createdAt: x.createdAt,
          paidAt: x.paidAt,
          order: x.order,
          refunds: x.refunds,
        })),
        total,
        p,
      ),
    );
  });

  r.get('/:id', async (req, res) => {
    const payment = await c.prisma.payment.findUnique({
      where: { id: param(req, 'id') },
      include: { order: { include: { items: true, game: { select: { name: true } } } } },
    });
    if (!payment || payment.order.userId !== req.auth!.userId) throw notFound('Payment');
    res.json({
      payment: {
        id: payment.id,
        provider: payment.provider,
        status: payment.status,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        expiresAt: payment.expiresAt,
        order: {
          id: payment.order.id,
          orderNumber: payment.order.orderNumber,
          status: payment.order.status,
          gameName: payment.order.game.name,
          productName: payment.order.items[0]?.productName,
          playerId: payment.order.playerId,
        },
      },
    });
  });

  /**
   * Mock gateway checkout completion. Builds a signed webhook exactly as a real gateway would
   * and pushes it through the normal webhook pipeline (signature, replay and dedupe checks).
   */
  r.post('/:id/mock-complete', async (req, res) => {
    if (!c.env.ENABLE_MOCK_PAYMENTS) throw forbidden('Mock payments are disabled');
    const { outcome } = parse(z.object({ outcome: z.enum(['success', 'failure']) }), req.body);
    const payment = await c.prisma.payment.findUnique({ where: { id: param(req, 'id') }, include: { order: true } });
    if (!payment || payment.order.userId !== req.auth!.userId) throw notFound('Payment');
    if (payment.provider !== 'mock' || !payment.providerPaymentId) throw forbidden('Not a mock payment');
    const webhook = c.mockPayments.simulate(payment.providerPaymentId, outcome);
    const result = await c.payments.handleWebhook('mock', webhook.body, webhook.headers);
    res.json({ ok: true, result });
  });

  return r;
}
