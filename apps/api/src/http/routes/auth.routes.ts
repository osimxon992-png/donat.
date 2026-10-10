import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '@donat/shared';
import { Router } from 'express';
import type { Container } from '../../container';
import { parse } from '../../lib/validate';
import { publicUser } from '../../modules/auth/auth.service';
import {
  clearAuthCookies,
  clientInfo,
  issueCsrfCookie,
  REFRESH_COOKIE,
  setAuthCookies,
  type AuthMiddleware,
} from '../auth-middleware';
import { rateLimit } from '../rate-limit';

export function authRoutes(c: Container, mw: AuthMiddleware) {
  const r = Router();
  const authLimiter = rateLimit({
    store: c.rateLimitStore,
    windowMs: c.env.RATE_LIMIT_WINDOW_SECONDS * 1000,
    max: c.env.AUTH_RATE_LIMIT_MAX,
    prefix: 'auth',
  });

  r.get('/csrf', (_req, res) => {
    res.json({ csrfToken: issueCsrfCookie(res, c.env) });
  });

  r.post('/register', authLimiter, async (req, res) => {
    const input = parse(registerSchema, req.body);
    const { user, tokens } = await c.auth.register(input, clientInfo(req));
    setAuthCookies(res, c.env, tokens);
    res.status(201).json({ user });
  });

  r.post('/login', authLimiter, async (req, res) => {
    const input = parse(loginSchema, req.body);
    const { user, tokens } = await c.auth.login(input, clientInfo(req));
    setAuthCookies(res, c.env, tokens);
    res.json({ user });
  });

  r.post('/refresh', authLimiter, async (req, res) => {
    try {
      const tokens = await c.auth.refresh(req.cookies?.[REFRESH_COOKIE], clientInfo(req));
      setAuthCookies(res, c.env, tokens);
      res.json({ ok: true });
    } catch (err) {
      clearAuthCookies(res, c.env);
      throw err;
    }
  });

  r.post('/logout', async (req, res) => {
    await c.auth.logout(req.auth?.sessionId, req.cookies?.[REFRESH_COOKIE]);
    if (req.auth) await c.audit.log({ actorId: req.auth.userId, action: 'auth.logout', entityType: 'User', entityId: req.auth.userId, ...clientInfo(req) });
    clearAuthCookies(res, c.env);
    res.json({ ok: true });
  });

  r.post('/logout-all', mw.requireAuth, async (req, res) => {
    await c.auth.logoutAll(req.auth!.userId);
    clearAuthCookies(res, c.env);
    res.json({ ok: true });
  });

  r.get('/me', mw.requireAuth, async (req, res) => {
    const user = await c.prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId }, include: { role: true } });
    res.json({ user: publicUser(user) });
  });

  r.post('/password/change', mw.requireAuth, authLimiter, async (req, res) => {
    const input = parse(changePasswordSchema, req.body);
    await c.auth.changePassword(req.auth!.userId, req.auth!.sessionId, input.currentPassword, input.newPassword, clientInfo(req));
    res.json({ ok: true });
  });

  r.post('/password/forgot', authLimiter, async (req, res) => {
    const input = parse(forgotPasswordSchema, req.body);
    await c.auth.requestPasswordReset(input.email, clientInfo(req));
    // Same response whether or not the account exists.
    res.json({ ok: true, message: 'If an account exists for that email, a reset link has been sent.' });
  });

  r.post('/password/reset', authLimiter, async (req, res) => {
    const input = parse(resetPasswordSchema, req.body);
    await c.auth.resetPassword(input.token, input.newPassword, clientInfo(req));
    res.json({ ok: true });
  });

  r.get('/sessions', mw.requireAuth, async (req, res) => {
    const sessions = await c.prisma.session.findMany({
      where: { userId: req.auth!.userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: { id: true, userAgent: true, ip: true, createdAt: true, lastUsedAt: true },
    });
    res.json({ sessions: sessions.map((s) => ({ ...s, current: s.id === req.auth!.sessionId })) });
  });

  return r;
}
