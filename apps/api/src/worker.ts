import { loadEnv } from './config/env';
import { createContainer } from './container';

/**
 * Standalone fulfillment worker (production). Requires REDIS_URL; run API instances with
 * RUN_WORKER_IN_PROCESS=false so only workers execute supplier calls.
 */
async function main() {
  const env = loadEnv();
  if (!env.REDIS_URL) throw new Error('The standalone worker requires REDIS_URL (BullMQ).');
  const c = createContainer(env);
  c.queue.process((name, data) => c.fulfillment.handleJob(name, data));
  c.logger.info({ realFulfillment: env.ENABLE_REAL_FULFILLMENT }, 'fulfillment worker started');

  const shutdown = async () => {
    await c.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
