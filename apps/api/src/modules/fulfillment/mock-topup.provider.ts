import crypto from 'node:crypto';
import type {
  PlayerValidationResult,
  ProviderBalance,
  ProviderHealthResult,
  SupplierOrderStatus,
  TopUpProvider,
  TopUpRequest,
  TopUpResult,
} from './topup-provider';

export interface MockTopUpOptions {
  latencyMs?: number;
  startingBalanceMinor?: number;
  currency?: string;
}

/**
 * Simulated top-up supplier. Delivers nothing real. Player IDs drive deterministic scenarios
 * so every failure path can be exercised locally and in tests:
 *
 *   starts with 000  -> player does not exist (validation fails)
 *   ends with 8888   -> supplier rejects permanently (non-retryable failure)
 *   ends with 7777   -> first attempt fails with a retryable error, retry succeeds
 *   ends with 9999   -> supplier delivers but the response is lost (timeout) -> reconciliation finds SUCCESS
 *   ends with 6666   -> request never reaches supplier on first attempt (network error) -> reconciliation finds NOT_FOUND -> safe retry
 *   anything else    -> success
 */
export class MockTopUpProvider implements TopUpProvider {
  readonly isLive = false;
  private readonly orders = new Map<string, { status: 'SUCCESS' | 'FAILED'; supplierOrderId?: string; message?: string }>();
  /** Number of successful deliveries per order number — lets tests prove there is no double top-up. */
  readonly deliveries = new Map<string, number>();
  private readonly attemptsByOrder = new Map<string, number>();
  topUpCalls = 0;
  private balanceMinor: number;
  private readonly currency: string;
  private latencyMs: number;
  forceDown = false;

  constructor(
    readonly code: string,
    opts: MockTopUpOptions = {},
  ) {
    this.latencyMs = opts.latencyMs ?? 0;
    this.balanceMinor = opts.startingBalanceMinor ?? 100_000_000;
    this.currency = opts.currency ?? 'USD';
  }

  setLatency(ms: number) {
    this.latencyMs = ms;
  }

  private async delay() {
    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs));
  }

  async validatePlayer(_gameSlug: string, playerId: string): Promise<PlayerValidationResult> {
    await this.delay();
    if (playerId.startsWith('000')) return { valid: false, reason: 'Player not found' };
    return { valid: true, nickname: `Player_${playerId.slice(-4)}` };
  }

  async topUp(req: TopUpRequest): Promise<TopUpResult> {
    this.topUpCalls += 1;
    await this.delay();
    if (this.forceDown) return { outcome: 'UNKNOWN', code: 'CONNECTION_REFUSED', message: 'Supplier unreachable' };

    // Idempotent on externalReference, like a well-behaved supplier.
    const existing = this.orders.get(req.externalReference);
    if (existing?.status === 'SUCCESS') return { outcome: 'SUCCESS', supplierOrderId: existing.supplierOrderId! };

    const attempt = (this.attemptsByOrder.get(req.orderNumber) ?? 0) + 1;
    this.attemptsByOrder.set(req.orderNumber, attempt);
    const id = req.playerId;

    if (id.startsWith('000')) {
      this.orders.set(req.externalReference, { status: 'FAILED', message: 'Player not found' });
      return { outcome: 'FAILED', retryable: false, code: 'INVALID_PLAYER', message: 'Player not found' };
    }
    if (id.endsWith('8888')) {
      this.orders.set(req.externalReference, { status: 'FAILED', message: 'Region restricted' });
      return { outcome: 'FAILED', retryable: false, code: 'REGION_RESTRICTED', message: 'Account region is not supported' };
    }
    if (id.endsWith('7777') && attempt === 1) {
      this.orders.set(req.externalReference, { status: 'FAILED', message: 'Temporarily unavailable' });
      return { outcome: 'FAILED', retryable: true, code: 'SUPPLIER_BUSY', message: 'Supplier temporarily unavailable' };
    }
    if (id.endsWith('6666') && attempt === 1) {
      // Simulates a connection error before the supplier received anything.
      return { outcome: 'UNKNOWN', code: 'NETWORK_ERROR', message: 'socket hang up' };
    }
    if (req.expectedCostMinor > this.balanceMinor) {
      this.orders.set(req.externalReference, { status: 'FAILED', message: 'Insufficient balance' });
      return { outcome: 'FAILED', retryable: true, code: 'INSUFFICIENT_BALANCE', message: 'Supplier balance too low' };
    }

    const supplierOrderId = `MOCK-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    this.orders.set(req.externalReference, { status: 'SUCCESS', supplierOrderId });
    this.balanceMinor -= req.expectedCostMinor;
    this.deliveries.set(req.orderNumber, (this.deliveries.get(req.orderNumber) ?? 0) + 1);

    if (id.endsWith('9999') && attempt === 1) {
      // Delivered, but the HTTP response never made it back to us.
      return { outcome: 'UNKNOWN', code: 'TIMEOUT', message: 'Supplier did not respond in time' };
    }
    return { outcome: 'SUCCESS', supplierOrderId };
  }

  async getOrderStatus(externalReference: string): Promise<SupplierOrderStatus> {
    await this.delay();
    const o = this.orders.get(externalReference);
    if (!o) return { status: 'NOT_FOUND' };
    return { status: o.status, supplierOrderId: o.supplierOrderId, message: o.message };
  }

  async getBalance(): Promise<ProviderBalance> {
    await this.delay();
    return { amountMinor: this.balanceMinor, currency: this.currency };
  }

  async healthCheck(): Promise<ProviderHealthResult> {
    const start = Date.now();
    await this.delay();
    if (this.forceDown) return { healthy: false, latencyMs: Date.now() - start, message: 'Supplier unreachable (simulated)' };
    return { healthy: true, latencyMs: Date.now() - start };
  }
}
