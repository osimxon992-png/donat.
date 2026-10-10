import pino from 'pino';

export type Logger = pino.Logger;

export function createLogger(level: string, pretty: boolean): Logger {
  return pino({
    level,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-csrf-token"]',
        'res.headers["set-cookie"]',
        '*.password',
        '*.passwordHash',
        '*.token',
        '*.apiKey',
        '*.secret',
      ],
      censor: '[redacted]',
    },
    ...(pretty ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } } : {}),
  });
}

/** Remove secrets from objects before they are stored in logs or the database. */
export function redact<T>(value: T): T {
  const SENSITIVE = /pass(word)?|secret|token|api[-_]?key|authorization|signature|credential/i;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, SENSITIVE.test(k) ? '[redacted]' : walk(val)]),
      );
    }
    return v;
  };
  return walk(value) as T;
}
