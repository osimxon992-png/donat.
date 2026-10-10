import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

/**
 * Starts a disposable PostgreSQL (embedded, no Docker needed) and applies migrations.
 * Set TEST_DATABASE_URL to use an existing server instead (e.g. in CI with a service container).
 */
export default async function setup() {
  const apiRoot = path.resolve(__dirname, '..');
  let stop: (() => Promise<void>) | undefined;

  if (!process.env.TEST_DATABASE_URL) {
    const { startEmbeddedPostgres } = (await import(
      path.resolve(apiRoot, '../../scripts/embedded-pg.mjs')
    )) as typeof import('../../../scripts/embedded-pg.mjs');
    const port = Number(process.env.TEST_DB_PORT ?? 54329);
    const dataDir = path.join(os.tmpdir(), `donat-test-pg-${port}`);
    const pg = await startEmbeddedPostgres({ dataDir, port, databases: [] });
    const client = pg.getPgClient();
    await client.connect();
    await client.query('DROP DATABASE IF EXISTS donat_test WITH (FORCE)');
    await client.query('CREATE DATABASE donat_test');
    await client.end();
    stop = () => pg.stop();
  }

  // globalSetup runs in the main process, where vitest's `test.env` is NOT applied,
  // so pass the test database URL explicitly (never fall back to the dev .env).
  const port = Number(process.env.TEST_DB_PORT ?? 54329);
  const databaseUrl = process.env.TEST_DATABASE_URL ?? `postgresql://donat:donat@localhost:${port}/donat_test?schema=public`;
  execSync('npx prisma migrate deploy', {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });

  return async () => {
    await stop?.();
  };
}
