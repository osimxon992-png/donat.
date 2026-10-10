import { isPermission, ORDER_STATUSES, ORDER_STATUS_LABELS, PERMISSIONS, type OrderStatus } from '@donat/shared';
import type { Prisma, TicketStatus } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '../../container';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../../lib/errors';
import { paged, pagination, param, parse, str } from '../../lib/validate';
import { clientInfo, type AuthMiddleware } from '../auth-middleware';

const noteSchema = z.object({ note: z.string().trim().min(3).max(500) });

export function adminOpsRoutes(c: Container, mw: AuthMiddleware) {
  const r = Router();
  const audit = (req: Parameters<typeof clientInfo>[0], action: string, entityType: string, entityId: string | null, metadata?: Record<string, unknown>) =>
    c.audit.log({ actorId: req.auth!.userId, action, entityType, entityId, metadata, ...clientInfo(req) });

  // ───────────── Orders ─────────────
  const canReadOrders = mw.requirePermission('orders:read');
  const canManageOrders = mw.requirePermission('orders:manage');

  r.get('/orders', canReadOrders, async (req, res) => {
    const p = pagination(req.query as Record<string, unknown>);
    const q = str(req.query.q)?.slice(0, 100);
    const status = str(req.query.status);
    const from = str(req.query.from);
    const to = str(req.query.to);
    const where: Prisma.OrderWhereInput = {
      ...(status && (ORDER_STATUSES as readonly string[]).includes(status) ? { status: status as OrderStatus } : {}),
      ...(q
        ? {
            OR: [
              { orderNumber: { contains: q, mode: 'insensitive' } },
              { playerId: { contains: q } },
              { user: { email: { contains: q, mode: 'insensitive' } } },
              { id: q },
            ],
          }
        : {}),
      ...(from || to
        ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}) } }
        : {}),
    };
    const [items, total] = await c.prisma.$transaction([
      c.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: p.skip,
        take: p.take,
        include: {
          user: { select: { email: true } },
          game: { select: { name: true } },
          items: { select: { productName: true } },
          payments: { select: { status: true }, orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
      c.prisma.order.count({ where }),
    ]);
    res.json(
      paged(
        items.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          status: o.status,
          statusLabel: ORDER_STATUS_LABELS[o.status as OrderStatus],
          userEmail: o.user.email,
          gameName: o.game.name,
          productName: o.items[0]?.productName,
          playerId: o.playerId,
          totalMinor: o.totalMinor,
          costMinor: o.costMinor,
          currency: o.currency,
          paymentStatus: o.payments[0]?.status ?? null,
          createdAt: o.createdAt,
        })),
        total,
        p,
      ),
    );
  });

  r.get('/orders/:id', canReadOrders, async (req, res) => {
    const order = await c.prisma.order.findUnique({
      where: { id: param(req, 'id') },
      include: {
        user: { select: { id: true, email: true, name: true } },
        game: { select: { name: true, slug: true } },
        items: true,
        events: { orderBy: { createdAt: 'asc' } },
        payments: { orderBy: { createdAt: 'desc' }, include: { transactions: { orderBy: { createdAt: 'asc' } } } },
        attempts: { orderBy: { attemptNumber: 'asc' }, include: { provider: { select: { code: true, name: true } } } },
        refunds: { orderBy: { createdAt: 'desc' } },
        promotion: { select: { code: true } },
        provider: { select: { code: true, name: true } },
      },
    });
    if (!order) throw notFound('Order');
    const providerLogs = await c.prisma.providerApiLog.findMany({ where: { orderId: order.id }, orderBy: { createdAt: 'asc' }, take: 100 });
    const unresolved = order.attempts.some((a) => a.status === 'PENDING' || a.status === 'UNKNOWN');
    res.json({
      order: { ...order, statusLabel: ORDER_STATUS_LABELS[order.status as OrderStatus] },
      providerLogs,
      actions: {
        canRetry: ['FAILED', 'MANUAL_REVIEW'].includes(order.status) && !unresolved,
        canReconcile: ['PROCESSING', 'MANUAL_REVIEW'].includes(order.status) && unresolved,
        canRefund: ['PAID', 'QUEUED', 'FAILED', 'MANUAL_REVIEW'].includes(order.status) && !unresolved && !order.attempts.some((a) => a.status === 'SUCCEEDED'),
        canMarkFulfilled: order.status === 'MANUAL_REVIEW',
        canMarkReview: ['PAID', 'QUEUED', 'PROCESSING', 'FAILED'].includes(order.status),
      },
    });
  });

  r.post('/orders/:id/retry', canManageOrders, async (req, res) => {
    const order = await c.prisma.order.findUnique({ where: { id: param(req, 'id') }, include: { attempts: true } });
    if (!order) throw notFound('Order');
    if (order.attempts.some((a) => a.status === 'PENDING' || a.status === 'UNKNOWN')) {
      throw conflict('Reconcile the unresolved attempt with the supplier before retrying', 'RECONCILE_FIRST');
    }
    if (order.attempts.some((a) => a.status === 'SUCCEEDED')) throw conflict('Supplier already confirmed delivery', 'ALREADY_DELIVERED');
    await c.orderState.transition(c.prisma, order.id, 'QUEUED', {
      from: ['FAILED', 'MANUAL_REVIEW'],
      message: 'Delivery retry requested by staff',
      actorId: req.auth!.userId,
      data: { failureReason: null },
    });
    await c.fulfillment.enqueueFulfillment(order.id);
    await audit(req, 'order.retry', 'Order', order.id);
    res.json({ ok: true });
  });

  r.post('/orders/:id/reconcile', canManageOrders, async (req, res) => {
    const summary = await c.reconciliation.reconcileOrder(param(req, 'id'), req.auth!.userId);
    await audit(req, 'order.reconcile', 'Order', param(req, 'id'), { outcome: summary.outcome });
    res.json({ summary });
  });

  r.post('/orders/:id/manual-review', canManageOrders, async (req, res) => {
    const { note } = parse(noteSchema, req.body);
    await c.orderState.transition(c.prisma, param(req, 'id'), 'MANUAL_REVIEW', {
      message: `Manual review: ${note}`,
      actorId: req.auth!.userId,
    });
    await audit(req, 'order.manual_review', 'Order', param(req, 'id'), { note });
    res.json({ ok: true });
  });

  /** Staff confirmed delivery out-of-band with the supplier (e.g. supplier dashboard). */
  r.post('/orders/:id/mark-fulfilled', canManageOrders, async (req, res) => {
    const { note } = parse(noteSchema, req.body);
    await c.prisma.$transaction((tx) =>
      c.fulfillment.markFulfilled(tx, param(req, 'id'), `Marked delivered by staff: ${note}`, req.auth!.userId),
    );
    await audit(req, 'order.mark_fulfilled', 'Order', param(req, 'id'), { note });
    res.json({ ok: true });
  });

  r.post('/orders/:id/refund', mw.requirePermission('orders:refund'), async (req, res) => {
    const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(300) }), req.body);
    const refund = await c.refunds.refundOrder(param(req, 'id'), req.auth!.userId, reason);
    res.json({ refund });
  });

  r.post('/payments/:id/reconcile', canManageOrders, async (req, res) => {
    const changed = await c.payments.reconcilePayment(param(req, 'id'));
    await audit(req, 'payment.reconcile', 'Payment', param(req, 'id'), { changed });
    res.json({ changed });
  });

  r.get('/refunds', canReadOrders, async (req, res) => {
    const p = pagination(req.query as Record<string, unknown>);
    const [items, total] = await c.prisma.$transaction([
      c.prisma.refund.findMany({
        orderBy: { createdAt: 'desc' },
        skip: p.skip,
        take: p.take,
        include: { order: { select: { orderNumber: true } }, requestedBy: { select: { email: true } } },
      }),
      c.prisma.refund.count(),
    ]);
    res.json(paged(items, total, p));
  });

  // ───────────── Providers ─────────────
  const canReadProviders = mw.requirePermission('providers:read');
  const canWriteProviders = mw.requirePermission('providers:write');

  r.get('/providers', canReadProviders, async (_req, res) => {
    const providers = await c.prisma.topUpProvider.findMany({
      orderBy: { priority: 'asc' },
      include: { _count: { select: { products: true, attempts: true } } },
    });
    res.json({
      providers: providers.map((p) => ({ ...p, blocker: c.providers.realProviderBlocker(p) })),
      realFulfillmentEnabled: c.env.ENABLE_REAL_FULFILLMENT,
    });
  });

  const providerSchema = z.object({
    code: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{2,32}$/),
    name: z.string().trim().min(2).max(80),
    type: z.enum(['MOCK', 'AUTHORIZED_HTTP']),
    isEnabled: z.boolean().default(false),
    isAuthorized: z.boolean().default(false),
    authorizationNote: z.string().trim().max(500).optional().nullable(),
    priority: z.number().int().min(0).max(1000).default(100),
    baseUrl: z.url().refine((u) => u.startsWith('https://'), 'Base URL must use https').optional().nullable(),
    credentialsEnvPrefix: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,40}$/, 'Use an UPPER_SNAKE env var prefix').optional().nullable(),
    timeoutMs: z.number().int().min(1000).max(120_000).default(15_000),
  });

  function assertAuthorization(input: { isAuthorized?: boolean; authorizationNote?: string | null }) {
    if (input.isAuthorized && !input.authorizationNote?.trim()) {
      throw badRequest('Marking a provider as authorized requires an authorization reference (contract / agreement ID)');
    }
  }

  r.post('/providers', canWriteProviders, async (req, res) => {
    const input = parse(providerSchema, req.body);
    assertAuthorization(input);
    const provider = await c.prisma.topUpProvider.create({ data: input }).catch((e: { code?: string }) => {
      if (e.code === 'P2002') throw conflict('Provider code already exists', 'DUPLICATE');
      throw e;
    });
    await audit(req, 'provider.created', 'TopUpProvider', provider.id, { code: provider.code, type: provider.type });
    res.status(201).json({ provider });
  });

  r.patch('/providers/:id', canWriteProviders, async (req, res) => {
    const input = parse(providerSchema.omit({ code: true, type: true }).partial(), req.body);
    const current = await c.prisma.topUpProvider.findUnique({ where: { id: param(req, 'id') } });
    if (!current) throw notFound('Provider');
    assertAuthorization({
      isAuthorized: input.isAuthorized ?? current.isAuthorized,
      authorizationNote: input.authorizationNote === undefined ? current.authorizationNote : input.authorizationNote,
    });
    const provider = await c.prisma.topUpProvider.update({
      where: { id: param(req, 'id') },
      // Re-enabling clears a DOWN health flag so the provider is tried again.
      data: { ...input, ...(input.isEnabled === true && current.health === 'DOWN' ? { health: 'UNKNOWN' as const } : {}) },
    });
    c.providers.invalidate(provider.code);
    await audit(req, 'provider.updated', 'TopUpProvider', provider.id, input);
    res.json({ provider });
  });

  r.post('/providers/:id/health-check', canWriteProviders, async (req, res) => {
    const provider = await c.providers.checkHealth(param(req, 'id'));
    res.json({ provider });
  });

  r.get('/providers/:id/products', canReadProviders, async (req, res) => {
    const mappings = await c.prisma.providerProduct.findMany({
      where: { providerId: param(req, 'id') },
      include: { product: { select: { id: true, sku: true, name: true, game: { select: { name: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ mappings });
  });

  r.put('/providers/:id/products/:productId', canWriteProviders, async (req, res) => {
    const input = parse(
      z.object({
        providerSku: z.string().trim().min(1).max(100),
        costMinor: z.number().int().min(0).max(1_000_000_000),
        currency: z.string().trim().toUpperCase().length(3).default('USD'),
        isActive: z.boolean().default(true),
      }),
      req.body,
    );
    const mapping = await c.prisma.providerProduct.upsert({
      where: { providerId_productId: { providerId: param(req, 'id'), productId: param(req, 'productId') } },
      update: input,
      create: { ...input, providerId: param(req, 'id'), productId: param(req, 'productId') },
    });
    await audit(req, 'provider.mapping_saved', 'ProviderProduct', mapping.id, input);
    res.json({ mapping });
  });

  r.delete('/providers/:id/products/:productId', canWriteProviders, async (req, res) => {
    await c.prisma.providerProduct.deleteMany({ where: { providerId: param(req, 'id'), productId: param(req, 'productId') } });
    await audit(req, 'provider.mapping_deleted', 'ProviderProduct', null, { providerId: param(req, 'id'), productId: param(req, 'productId') });
    res.json({ ok: true });
  });

  r.get('/providers/:id/logs', canReadProviders, async (req, res) => {
    const p = pagination(req.query as Record<string, unknown>);
    const where: Prisma.ProviderApiLogWhereInput = {
      providerId: param(req, 'id'),
      ...(req.query.failedOnly === 'true' ? { success: false } : {}),
    };
    const [items, total] = await c.prisma.$transaction([
      c.prisma.providerApiLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take }),
      c.prisma.providerApiLog.count({ where }),
    ]);
    res.json(paged(items, total, p));
  });

  // ───────────── Users & roles ─────────────
  r.get('/users', mw.requirePermission('users:read'), async (req, res) => {
    const p = pagination(req.query as Record<string, unknown>);
    const q = str(req.query.q)?.slice(0, 100);
    const where: Prisma.UserWhereInput = q
      ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] }
      : {};
    const [items, total] = await c.prisma.$transaction([
      c.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: p.skip,
        take: p.take,
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          createdAt: true,
          lastLoginAt: true,
          role: { select: { id: true, name: true } },
          _count: { select: { orders: true } },
        },
      }),
      c.prisma.user.count({ where }),
    ]);
    res.json(paged(items, total, p));
  });

  r.get('/users/:id', mw.requirePermission('users:read'), async (req, res) => {
    const user = await c.prisma.user.findUnique({
      where: { id: param(req, 'id') },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
        failedLoginCount: true,
        lockedUntil: true,
        role: { select: { id: true, name: true } },
        orders: { orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, orderNumber: true, status: true, totalMinor: true, currency: true, createdAt: true } },
      },
    });
    if (!user) throw notFound('User');
    res.json({ user });
  });

  r.patch('/users/:id', mw.requirePermission('users:write'), async (req, res) => {
    const input = parse(z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']).optional(), roleId: z.string().optional() }), req.body);
    if (param(req, 'id') === req.auth!.userId) throw forbidden('You cannot change your own status or role');
    const target = await c.prisma.user.findUnique({ where: { id: param(req, 'id') }, include: { role: true } });
    if (!target) throw notFound('User');
    if (input.roleId) {
      const role = await c.prisma.role.findUnique({ where: { id: input.roleId } });
      if (!role) throw notFound('Role');
      const grantsMore = role.permissions.some((perm) => !req.auth!.permissions.includes(perm as never));
      if (grantsMore && !req.auth!.permissions.includes('roles:write')) throw forbidden('You cannot grant permissions you do not have');
    }
    if (target.role.name === 'SUPER_ADMIN' && !req.auth!.permissions.includes('roles:write')) throw forbidden();
    const user = await c.prisma.user.update({ where: { id: target.id }, data: input, select: { id: true, status: true, roleId: true } });
    if (input.status === 'SUSPENDED') await c.auth.logoutAll(target.id);
    await audit(req, 'user.updated', 'User', target.id, input);
    res.json({ user });
  });

  r.get('/roles', mw.requirePermission('users:read'), async (_req, res) => {
    const roles = await c.prisma.role.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { users: true } } } });
    res.json({ roles, permissions: PERMISSIONS });
  });

  const roleSchema = z.object({
    name: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{2,30}$/),
    description: z.string().trim().max(200).optional().nullable(),
    permissions: z.array(z.string()).refine((ps) => ps.every(isPermission), 'Unknown permission'),
  });

  r.post('/roles', mw.requirePermission('roles:write'), async (req, res) => {
    const input = parse(roleSchema, req.body);
    const role = await c.prisma.role.create({ data: input }).catch((e: { code?: string }) => {
      if (e.code === 'P2002') throw conflict('Role already exists', 'DUPLICATE');
      throw e;
    });
    await audit(req, 'role.created', 'Role', role.id, input);
    res.status(201).json({ role });
  });

  r.patch('/roles/:id', mw.requirePermission('roles:write'), async (req, res) => {
    const input = parse(roleSchema.omit({ name: true }).partial(), req.body);
    const role = await c.prisma.role.findUnique({ where: { id: param(req, 'id') } });
    if (!role) throw notFound('Role');
    if (role.name === 'SUPER_ADMIN') throw unprocessable('The SUPER_ADMIN role cannot be modified', 'SYSTEM_ROLE');
    const updated = await c.prisma.role.update({ where: { id: role.id }, data: input });
    await audit(req, 'role.updated', 'Role', role.id, input);
    res.json({ role: updated });
  });

  // ───────────── Audit & webhooks ─────────────
  r.get('/audit-logs', mw.requirePermission('audit:read'), async (req, res) => {
    const p = pagination(req.query as Record<string, unknown>);
    const where: Prisma.AuditLogWhereInput = {
      ...(str(req.query.action) ? { action: { contains: str(req.query.action) } } : {}),
      ...(str(req.query.entityType) ? { entityType: str(req.query.entityType) } : {}),
      ...(str(req.query.entityId) ? { entityId: str(req.query.entityId) } : {}),
      ...(str(req.query.actorId) ? { actorId: str(req.query.actorId) } : {}),
    };
    const [items, total] = await c.prisma.$transaction([
      c.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take, include: { actor: { select: { email: true } } } }),
      c.prisma.auditLog.count({ where }),
    ]);
    res.json(paged(items, total, p));
  });

  r.get('/webhook-events', mw.requirePermission('webhooks:read'), async (req, res) => {
    const p = pagination(req.query as Record<string, unknown>);
    const [items, total] = await c.prisma.$transaction([
      c.prisma.webhookEvent.findMany({ orderBy: { receivedAt: 'desc' }, skip: p.skip, take: p.take }),
      c.prisma.webhookEvent.count(),
    ]);
    res.json(paged(items, total, p));
  });

  // ───────────── Support ─────────────
  const canSupport = mw.requirePermission('support:manage');
  const TICKET_STATUSES = ['OPEN', 'AWAITING_CUSTOMER', 'AWAITING_SUPPORT', 'RESOLVED', 'CLOSED'] as const;

  r.get('/tickets', canSupport, async (req, res) => {
    const p = pagination(req.query as Record<string, unknown>);
    const status = str(req.query.status);
    const where = status && (TICKET_STATUSES as readonly string[]).includes(status) ? { status: status as TicketStatus } : {};
    const [items, total] = await c.support.listAll(where, p.skip, p.take);
    res.json(paged(items, total, p));
  });

  r.get('/tickets/:id', canSupport, async (req, res) => {
    res.json({ ticket: await c.support.get(param(req, 'id'), { userId: req.auth!.userId, isStaff: true }) });
  });

  r.post('/tickets/:id/messages', canSupport, async (req, res) => {
    const { message } = parse(z.object({ message: z.string().trim().min(1).max(5000) }), req.body);
    res.json({ ticket: await c.support.reply(param(req, 'id'), { userId: req.auth!.userId, isStaff: true }, message) });
  });

  r.post('/tickets/:id/status', canSupport, async (req, res) => {
    const { status } = parse(z.object({ status: z.enum(TICKET_STATUSES) }), req.body);
    await c.support.setStatus(param(req, 'id'), { userId: req.auth!.userId, isStaff: true }, status);
    res.json({ ok: true });
  });

  return r;
}
