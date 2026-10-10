/**
 * Payment gateway abstraction. Real gateways (card acquirers, local wallets, etc.) must be
 * implemented against their official documentation and are disabled unless
 * ENABLE_REAL_PAYMENTS=true. Only the MockPaymentProvider ships with this project.
 */

export interface CreatePaymentParams {
  paymentId: string;
  orderId: string;
  orderNumber: string;
  amountMinor: number;
  currency: string;
  description: string;
  customerEmail: string;
}

export interface CreatePaymentResult {
  providerPaymentId: string;
  checkoutUrl: string;
}

export type PaymentEventType = 'payment.succeeded' | 'payment.failed' | 'refund.succeeded' | 'refund.failed';

export interface PaymentWebhookEvent {
  eventId: string;
  type: PaymentEventType | string;
  providerPaymentId: string;
  amountMinor?: number;
  currency?: string;
  providerTransactionId?: string;
  providerRefundId?: string;
  failureReason?: string;
  occurredAt: Date;
  raw: unknown;
}

export interface PaymentStatusResult {
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'NOT_FOUND';
  amountMinor?: number;
  currency?: string;
  providerTransactionId?: string;
}

export interface RefundParams {
  providerPaymentId: string;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
  reason: string;
}

export interface RefundResult {
  status: 'SUCCEEDED' | 'PENDING' | 'FAILED';
  providerRefundId?: string;
  failureReason?: string;
}

export type WebhookHeaders = Record<string, string | string[] | undefined>;

export class WebhookVerificationError extends Error {}

export interface PaymentProvider {
  readonly code: string;
  /** True when the provider moves real money. */
  readonly isLive: boolean;
  createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>;
  /** Verify signature + timestamp (replay window) and parse. Throws WebhookVerificationError. */
  verifyWebhook(rawBody: Buffer, headers: WebhookHeaders): PaymentWebhookEvent;
  getPaymentStatus(providerPaymentId: string): Promise<PaymentStatusResult>;
  refund(params: RefundParams): Promise<RefundResult>;
}
