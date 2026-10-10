import type { Env } from '../../config/env';
import { notFound } from '../../lib/errors';
import type { PaymentProvider } from './payment-provider';

/**
 * Holds the payment providers that are allowed to run in this environment.
 * Live providers are only accepted when ENABLE_REAL_PAYMENTS=true; mock providers only when
 * ENABLE_MOCK_PAYMENTS=true. No live provider ships with this repository.
 */
export class PaymentProviderRegistry {
  private readonly providers = new Map<string, PaymentProvider>();

  constructor(private readonly env: Env) {}

  register(provider: PaymentProvider): void {
    if (provider.isLive && !this.env.ENABLE_REAL_PAYMENTS) return;
    if (!provider.isLive && !this.env.ENABLE_MOCK_PAYMENTS) return;
    this.providers.set(provider.code, provider);
  }

  get(code: string): PaymentProvider {
    const p = this.providers.get(code);
    if (!p) throw notFound('Payment provider');
    return p;
  }

  has(code: string): boolean {
    return this.providers.has(code);
  }

  /** The provider used for new checkouts. */
  default(): PaymentProvider {
    const live = [...this.providers.values()].find((p) => p.isLive);
    const any = live ?? this.providers.values().next().value;
    if (!any) throw new Error('No payment provider is enabled');
    return any;
  }

  list(): { code: string; isLive: boolean }[] {
    return [...this.providers.values()].map((p) => ({ code: p.code, isLive: p.isLive }));
  }
}
