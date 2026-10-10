import { profileUpdateSchema, savedPlayerSchema, ticketCreateSchema, ticketReplySchema } from '@donat/shared';
import { Router } from 'express';
import type { Container } from '../../container';
import { notFound } from '../../lib/errors';
import { param, parse } from '../../lib/validate';
import { publicUser } from '../../modules/auth/auth.service';
import { checkPlayerIdFormat } from '../../modules/orders/checkout.service';
import { clientInfo, type AuthMiddleware } from '../auth-middleware';

export function accountRoutes(c: Container, mw: AuthMiddleware) {
  const r = Router();
  r.use(mw.requireAuth);

  // ── Profile ──
  r.get('/profile', async (req, res) => {
    const user = await c.prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId }, include: { role: true } });
    const [orders, spent] = await Promise.all([
      c.prisma.order.count({ where: { userId: user.id } }),
      c.prisma.order.aggregate({ where: { userId: user.id, status: 'FULFILLED' }, _sum: { totalMinor: true } }),
    ]);
    res.json({ user: publicUser(user), stats: { orders, spentMinor: spent._sum.totalMinor ?? 0 } });
  });

  r.patch('/profile', async (req, res) => {
    const input = parse(profileUpdateSchema, req.body);
    const user = await c.prisma.user.update({
      where: { id: req.auth!.userId },
      data: {
        name: input.name,
        phone: input.phone === '' ? null : input.phone,
        marketingOptIn: input.marketingOptIn,
      },
      include: { role: true },
    });
    await c.audit.log({ actorId: user.id, action: 'account.profile_updated', entityType: 'User', entityId: user.id, ...clientInfo(req) });
    res.json({ user: publicUser(user) });
  });

  // ── Saved player IDs ──
  r.get('/saved-players', async (req, res) => {
    const players = await c.prisma.savedPlayer.findMany({
      where: { userId: req.auth!.userId },
      include: { game: { select: { name: true, slug: true, playerIdLabel: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ players });
  });

  r.post('/saved-players', async (req, res) => {
    const input = parse(savedPlayerSchema, req.body);
    const game = await c.prisma.game.findFirst({ where: { id: input.gameId, deletedAt: null } });
    if (!game) throw notFound('Game');
    checkPlayerIdFormat(game, input.playerId, input.serverId);
    const player = await c.prisma.savedPlayer.upsert({
      where: {
        userId_gameId_playerId_serverId: { userId: req.auth!.userId, gameId: game.id, playerId: input.playerId, serverId: input.serverId },
      },
      update: { label: input.label },
      create: { userId: req.auth!.userId, gameId: game.id, playerId: input.playerId, serverId: input.serverId, label: input.label },
    });
    res.status(201).json({ player });
  });

  r.delete('/saved-players/:id', async (req, res) => {
    const deleted = await c.prisma.savedPlayer.deleteMany({ where: { id: param(req, 'id'), userId: req.auth!.userId } });
    if (!deleted.count) throw notFound('Saved player');
    res.json({ ok: true });
  });

  // ── Notifications ──
  r.get('/notifications', async (req, res) => {
    const [items, unread] = await Promise.all([
      c.notifications.list(req.auth!.userId),
      c.notifications.unreadCount(req.auth!.userId),
    ]);
    res.json({ items, unread });
  });

  r.post('/notifications/read-all', async (req, res) => {
    await c.notifications.markAllRead(req.auth!.userId);
    res.json({ ok: true });
  });

  r.post('/notifications/:id/read', async (req, res) => {
    await c.notifications.markRead(req.auth!.userId, param(req, 'id'));
    res.json({ ok: true });
  });

  // ── Support tickets ──
  r.get('/tickets', async (req, res) => {
    res.json({ tickets: await c.support.listForUser(req.auth!.userId) });
  });

  r.post('/tickets', async (req, res) => {
    const input = parse(ticketCreateSchema, req.body);
    const ticket = await c.support.create(req.auth!.userId, input);
    res.status(201).json({ ticket });
  });

  r.get('/tickets/:id', async (req, res) => {
    res.json({ ticket: await c.support.get(param(req, 'id'), { userId: req.auth!.userId, isStaff: false }) });
  });

  r.post('/tickets/:id/messages', async (req, res) => {
    const input = parse(ticketReplySchema, req.body);
    res.json({ ticket: await c.support.reply(param(req, 'id'), { userId: req.auth!.userId, isStaff: false }, input.message) });
  });

  r.post('/tickets/:id/close', async (req, res) => {
    await c.support.setStatus(param(req, 'id'), { userId: req.auth!.userId, isStaff: false }, 'CLOSED');
    res.json({ ok: true });
  });

  return r;
}
