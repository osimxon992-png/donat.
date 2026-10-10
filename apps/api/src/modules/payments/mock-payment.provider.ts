import crypto from 'node:crypto';
import { hmacSha256Hex, safeEqualHex } from '../../lib/crypto';
import {
  WebhookVerificationError,
  type CreatePaymentParams,
  type CreatePaymentResult,
  type PaymentProvider,
  type PaymentStatusResult,
  type PaymentWebhookEvent,
  type RefundParams,
  type RefundResult,
  type WebhookHeaders,
} from './payment-provider';

export const MOCK_SIGNATURE_HEADER = 'x-mock-signature';

interface MockPaymentRecord {
  amountMinor: number;
  currency: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  transactionId?: string;
  refundedMinor: number;
  refundsByKey: Map<string, RefundResult>;
}

/**
 * Simulated payment gateway. No money moves. It behaves like a hosted-checkout gateway:
 * createPayment returns a checkout URL (our own mock checkout page), and the outcome is
 * delivered as an HMAC-signed webhook with a timestamp, exactly like a real gateway would.
 *
 * Signature header format (Stripe-style): `t=<unix seconds>,v1=<hex hmac_sha256(secret, "<t>.<body>")>`
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly code = 'mock';
  readonly isLive = false;
  private readonly payments = new Map<string, MockPaymentRecord>();

  constructor(
    private readonly opts: { secret: string; toleranceSeconds: number; appUrl: string },
  ) {}

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    const providerPaymentId = `mock_pay_${crypto.randomBytes(9).toString('hex')}`;
    this.payments.set(providerPaymentId, {
      amountMinor: params.amountMinor,
      currency: params.currency,
      status: 'PENDING',
      refundedMinor: 0,
      refundsByKey: new Map(),
    });
    return {
      providerPaymentId,
      checkoutUrl: `${this.opts.appUrl}/checkout/${params.orderId}/pay?payment=${params.paymentId}`,
    };
  }

  /** Simulate the customer completing (or failing) checkout. Returns a signed webhook to deliver. */
  simulate(providerPaymentId: string, outcome: 'success' | 'failure', nowSeconds = Math.floor(Date.now() / 1000)) {
    const record = this.payments.get(providerPaymentId);
    if (!record) throw new Error('Unknown mock payment');
    if (record.status === 'PENDING') {
      record.status = outcome === 'success' ? 'SUCCEEDED' : 'FAILED';
      if (outcome === 'success') record.transactionId = `mock_txn_${crypto.randomBytes(8).toString('hex')}`;
    }
    const payload = {
      id: `evt_${crypto.randomBytes(12).toString('hex')}`,
      type: record.status === 'SUCCEEDED' ? 'payment.succeeded' : 'payment.failed',
      created: nowSeconds,
      data: {
        payment_id: providerPaymentId,
        amount: record.amountMinor,
        currency: record.currency,
        transaction_id: record.transactionId,
        failure_reason: record.status === 'FAILED' ? 'card_declined' : undefined,
      },
    };
    return this.sign(payload, nowSeconds);
  }

  /** Build a signed webhook for an arbitrary payload (used by tests for tampering/replay cases). */
  sign(payload: unknown, nowSeconds = Math.floor(Date.now() / 1000)) {
    const body = Buffer.from(JSON.stringify(payload));
    const sig = hmacSha256Hex(this.opts.secret, Buffer.concat([Buffer.from(`${nowSeconds}.`), body]));
    return { body, headers: { [MOCK_SIGNATURE_HEADER]: `t=${nowSeconds},v1=${sig}`, 'content-type': 'application/json' } };
  }

  verifyWebhook(rawBody: Buffer, headers: WebhookHeaders): PaymentWebhookEvent {
    const header = headers[MOCK_SIGNATURE_HEADER];
    if (typeof header !== 'string') throw new WebhookVerificationError('missing signature header');
    const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=', 2) as [string, string]));
    const t = Number(parts.t);
    const v1 = parts.v1;
    if (!Number.isInteger(t) || !v1) throw new WebhookVerificationError('malformed signature header');
    const age = Math.abs(Math.floor(Date.now() / 1000) - t);
    if (age > this.opts.toleranceSeconds) throw new WebhookVerificationError('timestamp outside tolerance (possible replay)');
    const expected = hmacSha256Hex(this.opts.secret, Buffer.concat([Buffer.from(`${t}.`), rawBody]));
    if (!safeEqualHex(expected, v1)) throw new WebhookVerificationError('signature mismatch');

    let json: {
      id?: string;
      type?: string;
      created?: number;
      data?: {
        payment_id?: string;
        amount?: number;
        currency?: string;
        transaction_id?: string;
        refund_id?: string;
        failure_reason?: string;
      };
    };
    try {
      json = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new WebhookVerificationError('invalid JSON');
    }
    if (!json.id || !json.type || !json.data?.payment_id) throw new WebhookVerificationError('missing fields');
    return {
      eventId: json.id,
      type: json.type,
      providerPaymentId: json.data.payment_id,
      amountMinor: json.data.amount,
      currency: json.data.currency,
      providerTransactionId: json.data.transaction_id,
      providerRefundId: json.data.refund_id,
      failureReason: json.data.failure_reason,
      occurredAt: new Date((json.created ?? t) * 1000),
      raw: json,
    };
  }

  async getPaymentStatus(providerPaymentId: string): Promise<PaymentStatusResult> {
    const record = this.payments.get(providerPaymentId);
    if (!record) return { status: 'NOT_FOUND' };
    return {
      status: record.status,
      amountMinor: record.amountMinor,
      currency: record.currency,
      providerTransactionId: record.transactionId,
    };
  }

  /** Test helper: mark a payment as paid at the "gateway" without sending a webhook (lost webhook). */
  markPaidSilently(providerPaymentId: string) {
    const record = this.payments.get(providerPaymentId);
    if (!record) throw new Error('Unknown mock payment');
    record.status = 'SUCCEEDED';
    record.transactionId = `mock_txn_${crypto.randomBytes(8).toString('hex')}`;
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    const record = this.payments.get(params.providerPaymentId);
    if (!record || record.status !== 'SUCCEEDED') {
      // After an API restart the in-memory mock state is gone; treat as refundable in dev.
      if (!record) return { status: 'SUCCEEDED', providerRefundId: `mock_ref_${crypto.randomBytes(8).toString('hex')}` };
      return { status: 'FAILED', failureReason: 'payment_not_captured' };
    }
    const prior = record.refundsByKey.get(params.idempotencyKey);
    if (prior) return prior; // idempotent like a real gateway
    if (record.refundedMinor + params.amountMinor > record.amountMinor) {
      return { status: 'FAILED', failureReason: 'amount_exceeds_captured' };
    }
    record.refundedMinor += params.amountMinor;
    const result: RefundResult = { status: 'SUCCEEDED', providerRefundId: `mock_ref_${crypto.randomBytes(8).toString('hex')}` };
    record.refundsByKey.set(params.idempotencyKey, result);
    return result;
  }
}
