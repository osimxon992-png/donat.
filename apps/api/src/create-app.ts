import crypto from 'node:crypto';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { MulterError } from 'multer';
import pinoHttp from 'pino-http';
import type { Container } from './container';
import { createAuthMiddleware, csrfProtection } from './http/auth-middleware';
import { rateLimit } from './http/rate-limit';
import { accountRoutes } from './http/routes/account.routes';
import { adminCatalogRoutes } from './http/routes/admin-catalog.routes';
import { adminOpsRoutes } from './http/routes/admin-ops.routes';
import { authRoutes } from './http/routes/auth.routes';
import { catalogRoutes } from './http/routes/catalog.routes';
import { orderRoutes, paymentRoutes } from './http/routes/orders.routes';
import { webhookRoutes } from './http/routes/webhooks.routes';
import { AppError } from './lib/errors';

export function createApp(c: Container) {
  const app = express();
  const { env, logger } = c;

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY === 'true' ? true : env.TRUST_PROXY === 'false' ? false : env.TRUST_PROXY);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow uploaded images on the web origin
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], imgSrc: ["'self'"], frameAncestors: ["'none'"] } },
    }),
  );
  app.use((req, res, next) => {
    const incoming = req.headers['x-request-id'];
    req.requestId = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    next();
  });
  if (env.NODE_ENV !== 'test') {
    app.use(
      pinoHttp({
        logger,
        genReqId: (req) => (req as Request).requestId ?? crypto.randomUUID(),
        autoLogging: { ignore: (req) => req.url === '/api/health' },
        customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      }),
    );
  }

  const origins = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || origins.includes(origin)),
      credentials: true,
      allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Idempotency-Key', 'Authorization', 'X-Request-Id'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      maxAge: 600,
    }),
  );
  app.use(cookieParser());

  // Health checks (no auth, no rate limit).
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });
  app.get('/api/health/ready', async (_req, res) => {
    try {
      await c.prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ready', queue: c.queue.kind, realPayments: env.ENABLE_REAL_PAYMENTS, realFulfillment: env.ENABLE_REAL_FULFILLMENT });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  // Webhooks need the raw body, so they are mounted before express.json().
  app.use('/api/webhooks', webhookRoutes(c));

  app.use(express.json({ limit: '100kb' }));
  app.use(
    '/api',
    rateLimit({
      store: c.rateLimitStore,
      windowMs: env.RATE_LIMIT_WINDOW_SECONDS * 1000,
      max: env.RATE_LIMIT_MAX,
      prefix: 'global',
    }),
  );

  const mw = createAuthMiddleware(c.prisma, c.tokens);
  app.use('/api', mw.optionalAuth);
  app.use('/api', csrfProtection(env));

  app.use('/api/auth', authRoutes(c, mw));
  app.use('/api/catalog', catalogRoutes(c));
  app.use('/api/orders', orderRoutes(c, mw));
  app.use('/api/payments', paymentRoutes(c, mw));
  app.use('/api/account', accountRoutes(c, mw));
  app.use('/api/admin', mw.requirePermission('admin:access'), adminCatalogRoutes(c, mw), adminOpsRoutes(c, mw));

  app.use('/uploads', express.static(env.UPLOAD_DIR, { fallthrough: false, maxAge: '7d', index: false, dotfiles: 'deny' }));

  app.use((_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Route not found')));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'Something went wrong. Please try again.';
    let details: unknown;

    if (err instanceof AppError) {
      ({ status, code, message } = err);
      details = err.details;
    } else if (err instanceof MulterError) {
      status = 400;
      code = 'UPLOAD_ERROR';
      message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : err.message;
    } else if ((err as { type?: string }).type === 'entity.parse.failed') {
      status = 400;
      code = 'INVALID_JSON';
      message = 'Malformed JSON body';
    } else if ((err as { type?: string }).type === 'entity.too.large') {
      status = 413;
      code = 'PAYLOAD_TOO_LARGE';
      message = 'Request body too large';
    } else if ((err as { code?: string }).code === 'P2025') {
      status = 404;
      code = 'NOT_FOUND';
      message = 'Resource not found';
    } else if ((err as { status?: number }).status === 404 && (err as { expose?: boolean }).expose) {
      status = 404;
      code = 'NOT_FOUND';
      message = 'File not found';
    }

    if (status >= 500) logger.error({ err, requestId: req.requestId, path: req.path }, 'unhandled error');
    res.status(status).json({ error: { code, message, details, requestId: req.requestId } });
  });

  return app;
}
