/**
 * Top-up supplier abstraction.
 *
 * IMPORTANT: this project does not contain, and must not invent, any PUBG Mobile / Tencent /
 * Midasbuy / publisher API. A real supplier may only be connected through an
 * AuthorizedProviderAdapter subclass written against that supplier's official documentation,
 * after commercial authorization is confirmed and credentials are issued. Until then only the
 * MockTopUpProvider is usable, and real fulfillment stays disabled (ENABLE_REAL_FULFILLMENT=false).
 */

export interface PlayerValidationResult {
  valid: boolean;
  nickname?: string;
  reason?: string;
}

export interface TopUpRequest {
  /** Unique per attempt. Sent to the supplier so it can be queried during reconciliation. */
  externalReference: string;
  orderNumber: string;
  gameSlug: string;
  providerSku: string;
  playerId: string;
  serverId?: string;
  quantity: number;
  expectedCostMinor: number;
  currency: string;
}

export type TopUpResult =
  | { outcome: 'SUCCESS'; supplierOrderId: string; raw?: unknown }
  /** The supplier definitively rejected the request; nothing was delivered. */
  | { outcome: 'FAILED'; retryable: boolean; code: string; message: string; raw?: unknown }
  /** We do not know whether delivery happened (timeout, connection reset, 5xx after send). */
  | { outcome: 'UNKNOWN'; code: string; message: string; raw?: unknown };

export interface SupplierOrderStatus {
  status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'NOT_FOUND';
  supplierOrderId?: string;
  message?: string;
}

export interface ProviderBalance {
  amountMinor: number;
  currency: string;
}

export interface ProviderHealthResult {
  healthy: boolean;
  latencyMs: number;
  message?: string;
}

export interface TopUpProvider {
  readonly code: string;
  /** True when calls deliver real in-game currency. */
  readonly isLive: boolean;
  validatePlayer(gameSlug: string, playerId: string, serverId?: string): Promise<PlayerValidationResult>;
  /** Must not throw for transport errors — return outcome UNKNOWN instead. */
  topUp(request: TopUpRequest): Promise<TopUpResult>;
  getOrderStatus(externalReference: string): Promise<SupplierOrderStatus>;
  getBalance(): Promise<ProviderBalance>;
  healthCheck(): Promise<ProviderHealthResult>;
}

export class ProviderNotAvailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderNotAvailableError';
  }
}
