import { createApp } from './app';
import { loadEnv } from './config/env';
import { createContainer } from './container';
import { startScheduler } from './scheduler';

async function main() {
  const env = loadEnv();
  const c = createContainer(env);
  const app = createApp(c);

  if (c.queue.kind === 'memory' || env.RUN_WORKER_IN_PROCESS) {
    c.queue.process((name, data) => c.fulfillment.handleJob(name, data));
    c.logger.info({ queue: c.queue.kind }, 'fulfillment worker running in-process');
  }
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
