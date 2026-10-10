import type {
  PlayerValidationResult,
  ProviderBalance,
  ProviderHealthResult,
  SupplierOrderStatus,
  TopUpProvider,
  TopUpRequest,
  TopUpResult,
} from './topup-provider';
import { ProviderNotAvailableError } from './topup-provider';

export interface AuthorizedProviderConfig {
  code: string;
  baseUrl: string;
  timeoutMs: number;
  /** Credentials read from environment variables named `<credentialsEnvPrefix>_*`. Never sent to the frontend. */
  credentials: Readonly<Record<string, string>>;
  /** Reference to the signed reseller agreement / authorization documentation. */
  authorizationNote: string;
}

export interface HttpCall {
  method: 'GET' | 'POST' | 'PUT';
  path: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface HttpResponse {
  status: number;
  data: unknown;
}

export class TransportError extends Error {
  constructor(
    message: string,
    /** True when the request may have reached the supplier (timeout after send, reset mid-response). */
    readonly maybeDelivered: boolean,
  ) {
    super(message);
  }
}

/**
 * Base class for a REAL, contractually authorized top-up supplier.
 *
 * This class only contains transport plumbing (timeouts, error classification). It deliberately
 * contains NO knowledge of any specific supplier or publisher API: every request/response mapping
 * is abstract and must be implemented from the supplier's official API documentation.
 *
 * A subclass is only instantiated by ProviderManagerService when ALL of these hold:
 *   - ENABLE_REAL_FULFILLMENT=true
 *   - the TopUpProvider row is enabled AND marked isAuthorized (with an authorization note)
 *   - every credential listed in `requiredCredentials` is present in the environment
 *   - the adapter is registered in AUTHORIZED_ADAPTERS (provider-manager.service.ts)
 *
 * Never point an adapter at a consumer checkout website, and never automate purchases through
 * personal or unofficial accounts.
 */
export abstract class AuthorizedProviderAdapter implements TopUpProvider {
  readonly isLive = true;
  /** Names (without prefix) of credentials this adapter needs, e.g. ['API_KEY', 'API_SECRET']. */
  static readonly requiredCredentials: readonly string[] = [];

  constructor(protected readonly config: AuthorizedProviderConfig) {
    if (!config.baseUrl.startsWith('https://')) {
      throw new ProviderNotAvailableError(`Provider ${config.code} must use an https:// base URL`);
    }
    if (!config.authorizationNote.trim()) {
      throw new ProviderNotAvailableError(`Provider ${config.code} has no authorization reference on file`);
    }
  }

  get code(): string {
    return this.config.code;
  }

  // ── Supplier-specific mapping: implement from official documentation ──
  protected abstract buildValidatePlayer(gameSlug: string, playerId: string, serverId?: string): HttpCall;
  protected abstract parseValidatePlayer(res: HttpResponse): PlayerValidationResult;
  protected abstract buildTopUp(req: TopUpRequest): HttpCall;
  protected abstract parseTopUp(res: HttpResponse): TopUpResult;
  protected abstract buildOrderStatus(externalReference: string): HttpCall;
  protected abstract parseOrderStatus(res: HttpResponse): SupplierOrderStatus;
  protected abstract buildBalance(): HttpCall;
  protected abstract parseBalance(res: HttpResponse): ProviderBalance;
  /** Add authentication (API key header, request signature, ...) as documented by the supplier. */
  protected abstract authenticate(call: HttpCall): HttpCall;

  async validatePlayer(gameSlug: string, playerId: string, serverId?: string): Promise<PlayerValidationResult> {
    return this.parseValidatePlayer(await this.send(this.buildValidatePlayer(gameSlug, playerId, serverId)));
  }

  async topUp(req: TopUpRequest): Promise<TopUpResult> {
    try {
      const res = await this.send(this.buildTopUp(req));
      if (res.status >= 500) {
        // A 5xx after the request was sent does not prove nothing was delivered.
        return { outcome: 'UNKNOWN', code: `HTTP_${res.status}`, message: 'Supplier server error', raw: res.data };
      }
      return this.parseTopUp(res);
    } catch (err) {
      if (err instanceof TransportError) {
        return err.maybeDelivered
          ? { outcome: 'UNKNOWN', code: 'TIMEOUT', message: err.message }
          : { outcome: 'FAILED', retryable: true, code: 'CONNECT_FAILED', message: err.message };
      }
      return { outcome: 'UNKNOWN', code: 'UNEXPECTED', message: (err as Error).message };
    }
  }

  async getOrderStatus(externalReference: string): Promise<SupplierOrderStatus> {
    return this.parseOrderStatus(await this.send(this.buildOrderStatus(externalReference)));
  }

  async getBalance(): Promise<ProviderBalance> {
    return this.parseBalance(await this.send(this.buildBalance()));
  }

  async healthCheck(): Promise<ProviderHealthResult> {
    const start = Date.now();
    try {
      await this.getBalance();
      return { healthy: true, latencyMs: Date.now() - start };
    } catch (err) {
      return { healthy: false, latencyMs: Date.now() - start, message: (err as Error).message };
    }
  }

  protected async send(call: HttpCall): Promise<HttpResponse> {
    const signed = this.authenticate(call);
    const url = new URL(signed.path, this.config.baseUrl);
    for (const [k, v] of Object.entries(signed.query ?? {})) url.searchParams.set(k, v);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    let sent = false;
    try {
      const response = await fetch(url, {
        method: signed.method,
        headers: { 'content-type': 'application/json', accept: 'application/json', ...signed.headers },
        body: signed.body === undefined ? undefined : JSON.stringify(signed.body),
        signal: controller.signal,
      });
      sent = true;
      const text = await response.text();
      let data: unknown = text;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        /* keep raw text */
      }
      return { status: response.status, data };
    } catch (err) {
      const aborted = (err as Error).name === 'AbortError';
      // If we aborted, or failed after headers were received, the supplier may have processed it.
      const code = (err as { cause?: { code?: string } }).cause?.code;
      const refusedBeforeSend = code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EAI_AGAIN';
      throw new TransportError((err as Error).message, aborted || sent || !refusedBeforeSend);
    } finally {
      clearTimeout(timer);
    }
  }
}
