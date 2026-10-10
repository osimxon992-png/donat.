import type EmbeddedPostgres from 'embedded-postgres';

export function defaultDataDir(name: string): string;

export function startEmbeddedPostgres(options: {
  dataDir: string;
  port: number;
  user?: string;
  password?: string;
  databases?: string[];
  onLog?: (message: string) => void;
}): Promise<EmbeddedPostgres>;
