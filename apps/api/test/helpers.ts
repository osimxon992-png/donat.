import crypto from 'node:crypto';
import { SYSTEM_ROLES } from '@donat/shared';
import { PrismaClient } from '@prisma/client';
import pino from 'pino';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { createApp } from '../src/create-app';
import { loadEnv } from '../src/config/env';
import { createContainer, type Container } from '../src/container';
import { hashPassword } from '../src/lib/crypto';
import { MockTopUpProvider } from '../src/modules/fulfillment/mock-topup.provider';
import { InMemoryQueue } from '../src/queue/memory-queue';

export const ORIGIN = 'http://localhost:3000';
export const PASSWORD = 'Correct-Horse-42';

let shared: PrismaClient | undefined;

export interface TestContext {
  c: Container;
  app: ReturnType<typeof createApp>;
  queue: InMemoryQueue;
  prisma: PrismaClient;
  mockSupplier: () => MockTopUpProvider;
  close: () => Promise<void>;
}

export async function createTestContext(envOverrides: Record<string, string> = {}): Promise<TestContext> {
  shared ??= new PrismaClient();
  const prisma = shared;
  const logger = pino({ level: 'silent' });
  const queue = new InMemoryQueue(logger, { autoRun: false });
  const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', RATE_LIMIT_MAX: '10000', AUTH_RATE_LIMIT_MAX: '10000', ...envOverrides });
  const c = createContainer(env, {
    logger,
    prisma,
    queue,
    mockSupplierLatencyMs: 0,
    fulfillmentTiming: { retryBaseDelayMs: 0, reconcileDelayMs: 0 },
    reconcileSettleMs: 0,
  });
  queue.process((name, data) => c.fulfillment.handleJob(name, data));
  const app = createApp(c);
  return {
    c,
    app,
    queue,
    prisma,
    mockSupplier: () => {
      const provider = c.providers.getMock('mock-supplier');
      if (provider) return provider;
      // Instantiate through the manager so tests and the worker share the same instance.
      return c.providers.getClient({ code: 'mock-supplier', type: 'MOCK' } as never) as MockTopUpProvider;
    },
    close: async () => {
      await queue.close();
    },
  };
}

const TABLES = [
  'AuditLog',
  'Notification',
  'SupportTicketMessage',
  'SupportTicket',
  'ProviderApiLog',
  'FulfillmentAttempt',
  'WebhookEvent',
  'Refund',
  'PaymentTransaction',
  'Payment',
  'PromotionRedemption',
  'OrderEvent',
  'OrderItem',
  'Order',
  'SavedPlayer',
  'Promotion',
  'ProviderProduct',
  'TopUpProvider',
  'ProductPrice',
  'Product',
  'Game',
  'PasswordResetToken',
  'Session',
  'User',
  'Role',
];

export interface Fixture {
  gameId: string;
  productId: string;
  product2Id: string;
  inactiveProductId: string;
  serverGameSlug: string;
  providerId: string;
  priceMinor: number;
  costMinor: number;
}

/** Wipe every table and insert a small, known catalogue. */
export async function resetDb(prisma: PrismaClient): Promise<Fixture> {
  await prisma.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
  for (const [name, permissions] of Object.entries(SYSTEM_ROLES)) {
    await prisma.role.create({ data: { name, permissions: [...permissions], isSystem: true } });
  }
  const provider = await prisma.topUpProvider.create({
    data: { code: 'mock-supplier', name: 'Mock', type: 'MOCK', isEnabled: true, priority: 10 },
  });
  const game = await prisma.game.create({
    data: {
      slug: 'test-game',
      name: 'Test Game',
      currencyName: 'Gems',
      playerIdLabel: 'Player ID',
      playerIdPattern: '^[0-9]{6,12}$',
    },
  });
  const mk = async (sku: string, price: number, cost: number, isActive = true) => {
    const p = await prisma.product.create({ data: { gameId: game.id, sku, name: `${sku} pack`, amount: 100, isActive } });
    await prisma.productPrice.create({ data: { productId: p.id, currency: 'USD', costMinor: cost, priceMinor: price } });
    await prisma.providerProduct.create({ data: { providerId: provider.id, productId: p.id, providerSku: sku, costMinor: cost } });
    return p;
  };
  const product = await mk('TG-100', 999, 850);
  const product2 = await mk('TG-500', 4999, 4300);
  const inactive = await mk('TG-OLD', 199, 150, false);

  const serverGame = await prisma.game.create({
    data: {
      slug: 'server-game',
      name: 'Server Game',
      playerIdPattern: '^[0-9]{9}$',
      requiresServer: true,
      servers: ['EU', 'NA'],
    },
  });
  const sp = await prisma.product.create({ data: { gameId: serverGame.id, sku: 'SG-1', name: 'SG pack', amount: 10 } });
  await prisma.productPrice.create({ data: { productId: sp.id, currency: 'USD', costMinor: 80, priceMinor: 100 } });
  await prisma.providerProduct.create({ data: { providerId: provider.id, productId: sp.id, providerSku: 'SG-1', costMinor: 80 } });

  return {
    gameId: game.id,
    productId: product.id,
    product2Id: product2.id,
    inactiveProductId: inactive.id,
    serverGameSlug: serverGame.slug,
    providerId: provider.id,
    priceMinor: 999,
    costMinor: 850,
  };
}

export class Client {
  csrf = '';
  constructor(readonly agent: TestAgent) {}

  async init() {
    const res = await this.agent.get('/api/auth/csrf').set('Origin', ORIGIN);
    this.csrf = res.body.csrfToken;
    return this;
  }

  get(url: string) {
    return this.agent.get(url).set('Origin', ORIGIN);
  }

  post(url: string, body?: unknown, headers: Record<string, string> = {}) {
    return this.agent.post(url).set('Origin', ORIGIN).set('X-CSRF-Token', this.csrf).set(headers).send(body as object);
  }

  patch(url: string, body?: unknown) {
    return this.agent.patch(url).set('Origin', ORIGIN).set('X-CSRF-Token', this.csrf).send(body as object);
  }

  put(url: string, body?: unknown) {
    return this.agent.put(url).set('Origin', ORIGIN).set('X-CSRF-Token', this.csrf).send(body as object);
  }

  delete(url: string) {
    return this.agent.delete(url).set('Origin', ORIGIN).set('X-CSRF-Token', this.csrf);
  }
}

export async function newClient(ctx: TestContext): Promise<Client> {
  return new Client(request.agent(ctx.app)).init();
}

export async function registerClient(ctx: TestContext, email = `user-${crypto.randomUUID()}@test.dev`) {
  const client = await newClient(ctx);
  const res = await client.post('/api/auth/register', { email, password: PASSWORD, name: 'Test User' });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { client, user: res.body.user as { id: string; email: string } };
}

/** Create a user with a given role directly in the DB and log them in. */
export async function staffClient(ctx: TestContext, role: 'ADMIN' | 'SUPER_ADMIN' | 'SUPPORT') {
  const email = `${role.toLowerCase()}-${crypto.randomUUID()}@test.dev`;
  const roleRow = await ctx.prisma.role.findUniqueOrThrow({ where: { name: role } });
  const user = await ctx.prisma.user.create({
    data: { email, name: role, passwordHash: await hashPassword(PASSWORD), roleId: roleRow.id },
  });
  const client = await newClient(ctx);
  const res = await client.post('/api/auth/login', { email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login failed: ${res.status}`);
  return { client, user };
}

export function idemKey() {
  return `test-${crypto.randomUUID()}`;
}

export async function checkout(client: Client, body: Record<string, unknown>, key = idemKey()) {
  return client.post('/api/orders', body, { 'Idempotency-Key': key });
}

/** Checkout + successful mock payment + run the fulfillment queue. Returns the final order. */
export async function buyAndPay(ctx: TestContext, client: Client, productId: string, playerId: string) {
  const created = await checkout(client, { productId, playerId });
  if (created.status !== 201) throw new Error(`checkout failed: ${created.status} ${JSON.stringify(created.body)}`);
  const paid = await client.post(`/api/payments/${created.body.payment.id}/mock-complete`, { outcome: 'success' });
  if (paid.status !== 200) throw new Error(`payment failed: ${paid.status} ${JSON.stringify(paid.body)}`);
  await ctx.queue.drain();
  const order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: created.body.order.id }, include: { attempts: true } });
  return { orderId: order.id, order, paymentId: created.body.payment.id as string };
}
