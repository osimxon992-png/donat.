import { defineConfig } from 'vitest/config';

export const TEST_DB_PORT = Number(process.env.TEST_DB_PORT ?? 54329);

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // All files share one PostgreSQL database, so they run one at a time.
    fileParallelism: false,
    pool: 'forks',
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? `postgresql://donat:donat@localhost:${TEST_DB_PORT}/donat_test?schema=public`,
      LOG_LEVEL: 'silent',
      REDIS_URL: '',
    },
  },
});
