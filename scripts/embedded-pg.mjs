// Shared helper to run a real PostgreSQL server from npm (no Docker / installer needed).
// Used for local development (scripts/dev-db.mjs) and the API test suite.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

/** Keep database files OUT of synced folders (OneDrive/Dropbox corrupt live Postgres files). */
export function defaultDataDir(name) {
  const base =
    process.env.DEV_DB_DIR ??
    (process.platform === 'win32'
      ? path.join(process.env.LOCALAPPDATA ?? os.homedir(), 'donat')
      : path.join(os.homedir(), '.local', 'share', 'donat'));
  return path.join(base, name);
}

export async function startEmbeddedPostgres({ dataDir, port, user = 'donat', password = 'donat', databases = [], onLog }) {
  fs.mkdirSync(path.dirname(dataDir), { recursive: true });
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user,
    password,
    port,
    persistent: true,
    onLog: onLog ?? (() => {}),
    onError: (e) => {
      const msg = String(e ?? '');
      if (msg.trim()) console.error('[postgres]', msg.trim());
    },
  });
  if (!fs.existsSync(path.join(dataDir, 'PG_VERSION'))) {
    await pg.initialise();
  }
  // A previous crash can leave a stale pid file behind.
  const pidFile = path.join(dataDir, 'postmaster.pid');
  if (fs.existsSync(pidFile)) {
    try {
      const pid = Number(fs.readFileSync(pidFile, 'utf8').split('\n')[0]);
      process.kill(pid, 0);
    } catch {
      fs.rmSync(pidFile, { force: true });
    }
  }
  await pg.start();
  const client = pg.getPgClient();
  await client.connect();
  try {
    for (const db of databases) {
      const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [db]);
      if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${db}"`);
    }
  } finally {
    await client.end();
  }
  return pg;
}
