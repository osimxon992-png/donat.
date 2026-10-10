#!/usr/bin/env node
// Starts a local PostgreSQL 17 server for development on port 5433 (Ctrl+C to stop).
// Data lives in %LOCALAPPDATA%\donat\pgdata (Windows) or ~/.local/share/donat/pgdata.
// Connection string: postgresql://donat:donat@localhost:5433/donat
import { defaultDataDir, startEmbeddedPostgres } from './embedded-pg.mjs';

const port = Number(process.env.DEV_DB_PORT ?? 5433);
const dataDir = defaultDataDir('pgdata');

const pg = await startEmbeddedPostgres({ dataDir, port, databases: ['donat'] });
console.log(`PostgreSQL ready on port ${port}`);
console.log(`  DATABASE_URL=postgresql://donat:donat@localhost:${port}/donat`);
console.log(`  data dir: ${dataDir}`);
console.log('Press Ctrl+C to stop.');

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  console.log('Stopping PostgreSQL...');
  try {
    await pg.stop();
  } finally {
    process.exit(0);
  }
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
