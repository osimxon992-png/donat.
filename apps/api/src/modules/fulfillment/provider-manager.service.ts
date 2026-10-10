import type { Prisma, PrismaClient, ProviderProduct, TopUpProvider as ProviderRecord } from '@prisma/client';
import type { Env } from '../../config/env';
import { redact, type Logger } from '../../lib/logger';
import type { AuthorizedProviderAdapter, AuthorizedProviderConfig } from './authorized-provider.adapter';
import { MockTopUpProvider } from './mock-topup.provider';
import { ProviderNotAvailableError, type PlayerValidationResult, type TopUpProvider } from './topup-provider';

type AdapterClass = (new (config: AuthorizedProviderConfig) => AuthorizedProviderAdapter) & {
  requiredCredentials: readonly string[];
};

/**
 * Registry of real supplier adapters, keyed by TopUpProvider.code.
 *
 * Intentionally EMPTY. Add an entry only after you have (1) a signed reseller/distribution
 * agreement, (2) the supplier's official API documentation and (3) issued credentials.
 * See docs/PROVIDER_INTEGRATION.md.
 */
export const AUTHORIZED_ADAPTERS: Record<string, AdapterClass> = {};

const FAILURE_THRESHOLD = 5;

export interface SelectedProvider {
  record: ProviderRecord;
  mapping: ProviderProduct;
  client: TopUpProvider;
}

export class ProviderManagerService {
  private readonly clients = new Map<string, TopUpProvider>();
  private readonly consecutiveFailures = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly env: Env,
    private readonly logger: Logger,
    private readonly mockOptions: { latencyMs: number } = { latencyMs: 0 },
  ) {}

  /** Returns a client for a provider record or throws ProviderNotAvailableError explaining why. */
  getClient(record: ProviderRecord): TopUpProvider {
    const cached = this.clients.get(record.code);
    if (record.type === 'MOCK') {
      if (cached) return cached;
      const mock = new MockTopUpProvider(record.code, { latencyMs: this.mockOptions.latencyMs });
      this.clients.set(record.code, mock);
      return mock;
    }
    this.assertRealProviderAllowed(record);
    if (cached) return cached;
    const Adapter = AUTHORIZED_ADAPTERS[record.code]!;
    const prefix = record.credentialsEnvPrefix!;
    const credentials: Record<string, string> = {};
    for (const name of Adapter.requiredCredentials) {
      const value = process.env[`${prefix}_${name}`];
      if (!value) throw new ProviderNotAvailableError(`Missing credential ${prefix}_${name} for provider ${record.code}`);
      credentials[name] = value;
    }
    const client = new Adapter({
      code: record.code,
      baseUrl: record.baseUrl!,
      timeoutMs: record.timeoutMs,
      credentials,
      authorizationNote: record.authorizationNote ?? '',
    });
    this.clients.set(record.code, client);
    return client;
  }

  /** Why a real provider cannot be used (null when it can). Safe to show to admins. */
  realProviderBlocker(record: ProviderRecord): string | null {
    if (record.type === 'MOCK') return null;
    if (!this.env.ENABLE_REAL_FULFILLMENT) return 'Real fulfillment is disabled (ENABLE_REAL_FULFILLMENT=false)';
    if (!record.isAuthorized || !record.authorizationNote?.trim())
      return 'Provider is not marked as commercially authorized with a documented authorization reference';
    if (!AUTHORIZED_ADAPTERS[record.code]) return 'No adapter implementation is registered for this provider code';
    if (!record.baseUrl) return 'Base URL is not configured';
    if (!record.credentialsEnvPrefix) return 'Credentials environment prefix is not configured';
    return null;
  }

  private assertRealProviderAllowed(record: ProviderRecord) {
    const blocker = this.realProviderBlocker(record);
    if (blocker) throw new ProviderNotAvailableError(blocker);
  }

  /** Only for tests and the dev tools: direct access to a mock supplier. */
  getMock(code: string): MockTopUpProvider | undefined {
    const c = this.clients.get(code);
    return c instanceof MockTopUpProvider ? c : undefined;
  }

  /** Choose the best usable provider (enabled, not DOWN, mapped to the product) by priority. */
  async selectForProduct(productId: string): Promise<SelectedProvider> {
    const mappings = await this.prisma.providerProduct.findMany({
      where: { productId, isActive: true, provider: { isEnabled: true, health: { not: 'DOWN' } } },
      include: { provider: true },
      orderBy: { provider: { priority: 'asc' } },
    });
    const reasons: string[] = [];
    for (const m of mappings) {
      try {
        return { record: m.provider, mapping: m, client: this.getClient(m.provider) };
      } catch (err) {
        if (err instanceof ProviderNotAvailableError) {
          reasons.push(`${m.provider.code}: ${err.message}`);
          continue;
        }
        throw err;
      }
    }
    throw new ProviderNotAvailableError(
      reasons.length ? `No usable provider (${reasons.join('; ')})` : 'No enabled provider is mapped to this product',
    );
  }

  async validatePlayer(gameSlug: string, productId: string, playerId: string, serverId?: string): Promise<PlayerValidationResult> {
    const { record, client } = await this.selectForProduct(productId);
    return this.call(record, 'validatePlayer', null, { gameSlug, playerId, serverId }, () =>
      client.validatePlayer(gameSlug, playerId, serverId),
    );
  }

  /**
   * Execute a provider call, record it in ProviderApiLog (redacted), and track consecutive
   * failures so a misbehaving provider is marked DOWN automatically (simple circuit breaker).
   */
  async call<T>(
    record: ProviderRecord,
    operation: string,
    orderId: string | null,
    request: unknown,
    fn: () => Promise<T>,
    isFailure: (result: T) => boolean = () => false,
  ): Promise<T> {
    const start = Date.now();
    let result: T | undefined;
    let error: Error | undefined;
    try {
      result = await fn();
      return result;
    } catch (err) {
      error = err as Error;
      throw err;
    } finally {
      const failed = !!error || (result !== undefined && isFailure(result));
      await this.recordOutcome(record, failed);
      try {
        await this.prisma.providerApiLog.create({
          data: {
            providerId: record.id,
            operation,
            orderId,
            success: !failed,
            durationMs: Date.now() - start,
            requestSummary: redact(request ?? null) as Prisma.InputJsonValue,
            responseSummary: result === undefined ? undefined : (redact(result) as Prisma.InputJsonValue),
            errorMessage: error?.message,
          },
        });
      } catch (logErr) {
        this.logger.error({ err: logErr }, 'failed to write provider api log');
      }
    }
  }

  private async recordOutcome(record: ProviderRecord, failed: boolean) {
    const n = failed ? (this.consecutiveFailures.get(record.id) ?? 0) + 1 : 0;
    this.consecutiveFailures.set(record.id, n);
    if (n === FAILURE_THRESHOLD) {
      this.logger.warn({ provider: record.code }, 'provider marked DOWN after consecutive failures');
      await this.prisma.topUpProvider.update({
        where: { id: record.id },
        data: { health: 'DOWN', lastError: `${n} consecutive failures` },
      });
    }
  }

  async checkHealth(providerId: string) {
    const record = await this.prisma.topUpProvider.findUniqueOrThrow({ where: { id: providerId } });
    let health: ProviderRecord['health'] = 'DOWN';
    let lastError: string | null = null;
    let balance: { amountMinor: number; currency: string } | undefined;
    try {
      const client = this.getClient(record);
      const result = await this.call(record, 'healthCheck', null, null, () => client.healthCheck(), (r) => !r.healthy);
      health = result.healthy ? (result.latencyMs > 5000 ? 'DEGRADED' : 'HEALTHY') : 'DOWN';
      lastError = result.message ?? null;
      if (result.healthy) balance = await this.call(record, 'getBalance', null, null, () => client.getBalance());
    } catch (err) {
      lastError = (err as Error).message;
      health = err instanceof ProviderNotAvailableError ? 'UNKNOWN' : 'DOWN';
    }
    if (health === 'HEALTHY') this.consecutiveFailures.set(record.id, 0);
    return this.prisma.topUpProvider.update({
      where: { id: record.id },
      data: {
        health,
        lastError,
        lastHealthCheckAt: new Date(),
        ...(balance
          ? { balanceMinor: balance.amountMinor, balanceCurrency: balance.currency, balanceCheckedAt: new Date() }
          : {}),
      },
    });
  }

  async checkAllEnabled() {
    const providers = await this.prisma.topUpProvider.findMany({ where: { isEnabled: true } });
    for (const p of providers) {
      try {
        await this.checkHealth(p.id);
      } catch (err) {
        this.logger.error({ err, provider: p.code }, 'health check failed');
      }
    }
  }

  /** Drop cached client (e.g. after admin config changes). */
  invalidate(code: string) {
    const c = this.clients.get(code);
    if (c && !(c instanceof MockTopUpProvider)) this.clients.delete(code);
  }
}
