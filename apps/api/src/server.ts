import express, { type Express } from 'express';
import { createApp } from './create-app';
import { loadEnv, type Env } from './config/env';
import { createContainer, type Container } from './container';
import { startScheduler } from './scheduler';

const ON_VERCEL = Boolean(process.env.VERCEL);

/**
 * On Vercel a crashed function only yields a plain-text platform error page. Instead, keep
 * serving JSON so the web app shows a clean error and /api/health names what is wrong.
 * For configuration errors only variable names are reported, never values.
 */
function misconfiguredApp(err: unknown): Express {
  const message = err instanceof Error ? err.message : String(err);
  const lines = message.split('\n').map((l) => l.trim()).filter(Boolean);
  const problems = (lines.length > 1 ? lines.slice(1) : lines).map((l) => l.slice(0, 300));
  console.error(err);
  const app = express();
  app.get('/api/health', (_req, res) => {
    res.status(503).json({ status: 'misconfigured', problems });
  });
  app.use((_req, res) => {
    res.status(503).json({ error: { code: 'MISCONFIGURED', message: 'The store is temporarily unavailable. Please try again later.' } });
  });
  return app;
}

function bootstrap(): { app: Express; env?: Env; c?: Container } {
  try {
    const env = loadEnv();
    const c = createContainer(env);
    const app = createApp(c);
    if (c.queue.kind === 'memory' || env.RUN_WORKER_IN_PROCESS) {
      c.queue.process((name, data) => c.fulfillment.handleJob(name, data));
      c.logger.info({ queue: c.queue.kind }, 'fulfillment worker running in-process');
    }
    return { app, env, c };
  } catch (err) {
    if (ON_VERCEL) return { app: misconfiguredApp(err) };
    throw err;
  }
}

const { app, env, c } = bootstrap();

// Vercel invokes the exported app per request; it must not listen or exit the process.
export default app;

if (!ON_VERCEL && env && c) {
  const stopScheduler = env.SCHEDULER_ENABLED ? startScheduler(c) : () => undefined;

  const server = app.listen(env.PORT, () => {
    c.logger.info(
      {
        port: env.PORT,
        realPayments: env.ENABLE_REAL_PAYMENTS,
        realFulfillment: env.ENABLE_REAL_FULFILLMENT,
        queue: c.queue.kind,
      },
      `API listening on http://localhost:${env.PORT}`,
    );
    if (!env.ENABLE_REAL_PAYMENTS || !env.ENABLE_REAL_FULFILLMENT) {
      c.logger.warn('MOCK MODE: no real money is charged and no real game currency is delivered.');
    }
  });

  const shutdown = async (signal: string) => {
    c.logger.info({ signal }, 'shutting down');
    stopScheduler();
    server.close();
    await c.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}
