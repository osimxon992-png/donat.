import type { PrismaClient } from '@prisma/client';
import { isPermission, type Permission } from '@donat/shared';
import type { CookieOptions, NextFunction, Request, Response } from 'express';
import type { Env } from '../config/env';
import { forbidden, unauthorized } from '../lib/errors';
import { randomToken, safeEqualString } from '../lib/crypto';
import type { IssuedTokens } from '../modules/auth/auth.service';
import type { TokenService } from '../modules/auth/tokens';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
export const CSRF_COOKIE = 'csrf_token';
export const CSRF_HEADER = 'x-csrf-token';

function baseCookie(env: Env): CookieOptions {
  return { secure: env.COOKIE_SECURE, sameSite: 'lax', domain: env.COOKIE_DOMAIN };
}

export function setAuthCookies(res: Response, env: Env, tokens: IssuedTokens) {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...baseCookie(env),
    httpOnly: true,
    path: '/',
    maxAge: env.ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseCookie(env),
    httpOnly: true,
    path: '/api/auth',
    expires: tokens.refreshExpiresAt,
  });
}

export function clearAuthCookies(res: Response, env: Env) {
  res.clearCookie(ACCESS_COOKIE, { ...baseCookie(env), httpOnly: true, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...baseCookie(env), httpOnly: true, path: '/api/auth' });
}

export function issueCsrfCookie(res: Response, env: Env): string {
  const token = randomToken(24);
  res.cookie(CSRF_COOKIE, token, { ...baseCookie(env), httpOnly: false, path: '/' });
  return token;
}

function bearer(req: Request): string | undefined {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7).trim() : undefined;
}

/**
 * Double-submit CSRF protection for cookie-authenticated, state-changing requests.
 * Requests authenticated with an Authorization header are not vulnerable to CSRF.
 */
export function csrfProtection(env: Env) {
  const allowedOrigins = new Set(env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean));
  allowedOrigins.add(env.APP_URL);
  return (req: Request, _res: Response, next: NextFunction) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (bearer(req)) return next();
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.has(origin)) return next(forbidden('Cross-origin request blocked'));
    const cookie = req.cookies?.[CSRF_COOKIE] as string | undefined;
    const header = req.headers[CSRF_HEADER];
    if (!cookie || typeof header !== 'string' || !safeEqualString(cookie, header)) {
      return next(forbidden('Invalid or missing CSRF token'));
    }
    next();
  };
}

export function createAuthMiddleware(prisma: PrismaClient, tokens: TokenService) {
  /**
   * Populates req.auth when a valid access token is present. Never rejects by itself:
   * the token error is kept so protected routes can report it (e.g. TOKEN_EXPIRED).
   */
  const optionalAuth = async (req: Request, _res: Response, next: NextFunction) => {
    const token = bearer(req) ?? (req.cookies?.[ACCESS_COOKIE] as string | undefined);
    if (!token) return next();
    try {
      await resolve(req, token);
    } catch (err) {
      req.authError = err;
    }
    next();
  };

  async function resolve(req: Request, token: string) {
    const claims = await tokens.verifyAccessToken(token);
    const session = await prisma.session.findUnique({
      where: { id: claims.sid },
      include: { user: { include: { role: true } } },
    });
    if (!session || session.revokedAt || session.userId !== claims.sub || session.expiresAt < new Date()) {
      throw unauthorized('Session is no longer valid');
    }
    if (session.user.status !== 'ACTIVE') throw forbidden('This account is suspended');
    req.auth = {
      userId: session.user.id,
      sessionId: session.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role.name,
      permissions: session.user.role.permissions.filter(isPermission),
    };
  }

  const requireAuth = (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(req.authError ?? unauthorized());
    next();
  };

  const requirePermission =
    (...perms: Permission[]) =>
    (req: Request, _res: Response, next: NextFunction) => {
      if (!req.auth) return next(req.authError ?? unauthorized());
      const missing = perms.filter((p) => !req.auth!.permissions.includes(p));
      if (missing.length) return next(forbidden());
      next();
    };

  return { optionalAuth, requireAuth, requirePermission };
}

export type AuthMiddleware = ReturnType<typeof createAuthMiddleware>;

export function clientInfo(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}
