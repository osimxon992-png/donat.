import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Real environment variables win; then apps/api/.env; then the repo-root .env.
function findApiRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, 'prisma', 'schema.prisma'))) return dir;
    dir = path.dirname(dir);
  }
  return path.resolve(start, '../..');
}
const API_ROOT = findApiRoot(__dirname);
dotenv.config({ path: path.join(API_ROOT, '.env'), quiet: true });
dotenv.config({ path: path.join(API_ROOT, '../../.env'), quiet: true });

const bool = (def: boolean) =>
  z
    .enum(['true', 'false', '1', '0', 'yes', 'no'])
    .optional()
    .transform((v) => (v === undefined ? def : ['true', '1', 'yes'].includes(v)));

const DEV_SECRET_PREFIX = 'dev-only-';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.string().url().default('http://localhost:3000'),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  TRUST_PROXY: z.string().default('loopback'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional().transform((v) => (v ? v : undefined)),
  RUN_WORKER_IN_PROCESS: bool(true),

  JWT_ACCESS_SECRET: z.string().min(32).default(`${DEV_SECRET_PREFIX}access-secret-change-me-0000000000`),
  JWT_ISSUER: z.string().default('donat-api'),
  JWT_AUDIENCE: z.string().default('donat-web'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  COOKIE_SECURE: bool(false),
  COOKIE_DOMAIN: z.string().optional().transform((v) => (v ? v : undefined)),

  STORE_CURRENCY: z.string().length(3).default('USD'),
  ORDER_PAYMENT_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  FULFILLMENT_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  RECONCILE_MAX_CHECKS: z.coerce.number().int().min(1).max(50).default(5),

  // Payments
  ENABLE_REAL_PAYMENTS: bool(false),
  ENABLE_MOCK_PAYMENTS: bool(true),
  MOCK_PAYMENT_WEBHOOK_SECRET: z.string().min(16).default(`${DEV_SECRET_PREFIX}mock-webhook-secret`),
  WEBHOOK_TOLERANCE_SECONDS: z.coerce.number().int().positive().default(300),

  // Fulfillment
  ENABLE_REAL_FULFILLMENT: bool(false),

  // Uploads
  UPLOAD_DIR: z.string().default(path.join(API_ROOT, 'uploads')),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(2 * 1024 * 1024),

  // Rate limiting
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SCHEDULER_ENABLED: bool(true),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(overrides: Record<string, string | undefined> = {}): Env {
  // Treat empty values (`KEY=` in .env) as unset so defaults apply.
  const raw = Object.fromEntries(
    Object.entries({ ...process.env, ...overrides }).filter(([, v]) => v !== undefined && v !== ''),
  );
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production') {
    const problems: string[] = [];
    if (env.JWT_ACCESS_SECRET.startsWith(DEV_SECRET_PREFIX)) problems.push('JWT_ACCESS_SECRET must be set');
    if (env.MOCK_PAYMENT_WEBHOOK_SECRET.startsWith(DEV_SECRET_PREFIX) && env.ENABLE_MOCK_PAYMENTS)
      problems.push('MOCK_PAYMENT_WEBHOOK_SECRET must be set when mock payments are enabled');
    if (!env.COOKIE_SECURE) problems.push('COOKIE_SECURE must be true in production (HTTPS)');
    if (problems.length) throw new Error(`Refusing to start in production:\n  ${problems.join('\n  ')}`);
  }
  return env;
}
