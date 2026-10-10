import { PrismaClient } from '@prisma/client';
import IORedis from 'ioredis';
import type { Env } from './config/env';
import { MemoryRateLimitStore, RedisRateLimitStore, type RateLimitStore } from './http/rate-limit';
import { createLogger, type Logger } from './lib/logger';
import { AuditService } from './modules/audit/audit.service';
import { AuthService } from './modules/auth/auth.service';
import { TokenService } from './modules/auth/tokens';
import { CatalogService } from './modules/catalog/catalog.service';
import { FulfillmentQueueService, type FulfillmentTiming } from './modules/fulfillment/fulfillment-queue.service';
import { OrderReconciliationService } from './modules/fulfillment/order-reconciliation.service';
import { ProviderManagerService } from './modules/fulfillment/provider-manager.service';
import { LogMailer, type Mailer } from './modules/notifications/mailer';
import { NotificationService } from './modules/notifications/notification.service';
import { CheckoutService } from './modules/orders/checkout.service';
import { OrderStateService } from './modules/orders/order-state.service';
import { MockPaymentProvider } from './modules/payments/mock-payment.provider';
import { PaymentProviderRegistry } from './modules/payments/payment-provider.registry';
import { PaymentService } from './modules/payments/payment.service';
import { RefundService } from './modules/payments/refund.service';
import { StatsService } from './modules/admin/stats.service';
import { SupportService } from './modules/support/support.service';
import { BullMqQueue } from './queue/bullmq-queue';
import { InMemoryQueue } from './queue/memory-queue';
import type { JobQueue } from './queue/queue';

export interface ContainerOptions {
  logger?: Logger;
  prisma?: PrismaClient;
  queue?: JobQueue;
  mockSupplierLatencyMs?: number;
  fulfillmentTiming?: FulfillmentTiming;
  reconcileSettleMs?: number;
}

export function createContainer(env: Env, opts: ContainerOptions = {}) {
  const logger = opts.logger ?? createLogger(env.LOG_LEVEL, env.NODE_ENV === 'development');
  const prisma = opts.prisma ?? new PrismaClient();
  const redis = env.REDIS_URL ? new IORedis(env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: false }) : undefined;
  const queue: JobQueue = opts.queue ?? (env.REDIS_URL ? new BullMqQueue(env.REDIS_URL, logger) : new InMemoryQueue(logger));
  const rateLimitStore: RateLimitStore = redis ? new RedisRateLimitStore(redis) : new MemoryRateLimitStore();

  const audit = new AuditService(prisma, logger);
  const mailer: Mailer = new LogMailer(logger);
  const notifications = new NotificationService(prisma, logger);
  const tokens = new TokenService(env);
  const auth = new AuthService(prisma, env, tokens, audit, mailer, logger);
  const orderState = new OrderStateService();
  const catalog = new CatalogService(prisma);

  const providers = new ProviderManagerService(prisma, env, logger, {
    latencyMs: opts.mockSupplierLatencyMs ?? (env.NODE_ENV === 'development' ? 800 : 0),
  });
  const fulfillment = new FulfillmentQueueService(prisma, env, queue, providers, orderState, notifications, logger, opts.fulfillmentTiming);
  const reconciliation = new OrderReconciliationService(
    prisma,
    env,
    providers,
    fulfillment,
    orderState,
    logger,
    opts.reconcileSettleMs ?? 60_000,
  );
  fulfillment.setReconciliation(reconciliation);

  const paymentRegistry = new PaymentProviderRegistry(env);
  const mockPayments = new MockPaymentProvider({
    secret: env.MOCK_PAYMENT_WEBHOOK_SECRET,
    toleranceSeconds: env.WEBHOOK_TOLERANCE_SECONDS,
    appUrl: env.APP_URL,
  });
  paymentRegistry.register(mockPayments);
  // Real gateways would be registered here, e.g. paymentRegistry.register(new SomeGatewayProvider(...)).
  // The registry silently refuses live providers unless ENABLE_REAL_PAYMENTS=true.

  const payments = new PaymentService(prisma, env, paymentRegistry, orderState, fulfillment, notifications, audit, logger);
  const refunds = new RefundService(prisma, paymentRegistry, orderState, notifications, audit, logger);
  payments.setRefundService(refunds);
  const checkout = new CheckoutService(prisma, env, providers, payments, orderState, audit, logger);
  const support = new SupportService(prisma, notifications, audit);
  const stats = new StatsService(prisma);

  async function close() {
    await queue.close();
    redis?.disconnect();
    await prisma.$disconnect();
  }

  return {
    env,
    logger,
    prisma,
    queue,
    redis,
    rateLimitStore,
    audit,
    mailer,
    notifications,
    tokens,
    auth,
    orderState,
    catalog,
    providers,
    fulfillment,
    reconciliation,
    paymentRegistry,
    mockPayments,
    payments,
    refunds,
    checkout,
    support,
    stats,
    close,
  };
}

export type Container = ReturnType<typeof createContainer>;
