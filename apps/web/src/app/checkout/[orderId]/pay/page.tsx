'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ReceiptRow } from '@/components/receipt';
import { ErrorBox, Loading, Spinner, StatusBadge } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import { money } from '@/lib/format';
import { useApi } from '@/lib/hooks';

interface PaymentView {
  id: string;
  provider: string;
  status: string;
  amountMinor: number;
  currency: string;
  expiresAt: string;
  order: { id: string; orderNumber: string; status: string; gameName: string; productName?: string; playerId: string };
}

/**
 * Simulated hosted checkout. With a real gateway this step happens on the gateway's own page;
 * here the customer's choice is turned into a signed webhook, exactly like a gateway would send.
 * No card details are ever collected.
 */
function MockPay() {
  const { orderId } = useParams<{ orderId: string }>();
  const paymentId = useSearchParams().get('payment');
  const router = useRouter();
  const { allowed } = useRequireAuth();
  const { data, error, loading } = useApi<{ payment: PaymentView }>(allowed && paymentId ? `/payments/${paymentId}` : null);
  const [pending, setPending] = useState<'success' | 'failure'>();
  const [actionError, setActionError] = useState<string>();

  async function complete(outcome: 'success' | 'failure') {
    setPending(outcome);
    setActionError(undefined);
    try {
      await api(`/payments/${paymentId}/mock-complete`, { method: 'POST', body: { outcome } });
      router.push(`/orders/${orderId}`);
    } catch (err) {
      setActionError(errorMessage(err));
      setPending(undefined);
    }
  }

  if (!paymentId) return <ErrorBox message="This payment link is incomplete." />;
  if (loading || !allowed) return <Loading />;
  if (error || !data) return <ErrorBox message={error} />;
  const p = data.payment;

  return (
    <div className="mx-auto max-w-[420px] pt-4">
      <div className="overflow-hidden rounded-[12px] border border-ink/15 bg-white shadow-[0_24px_60px_-30px_rgba(22,21,19,0.45)]">
        <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
          <span className="font-display text-lg font-bold tracking-tight">
            test<span className="text-info">pay</span>
          </span>
          <span className="rounded-sm bg-warn/10 px-2 py-0.5 font-mono text-[10px] tracking-wider text-warn uppercase">Sandbox</span>
        </div>
        <div className="px-6 py-6">
          <p className="text-sm text-muted">Pay Donat</p>
          <p className="mt-1 font-display text-5xl font-bold tracking-tight tabular-nums">{money(p.amountMinor, p.currency)}</p>
          <div className="mt-6 space-y-2">
            <ReceiptRow label="Order" value={p.order.orderNumber} />
            <ReceiptRow label="Item" value={`${p.order.productName ?? ''} · ${p.order.gameName}`} />
            <ReceiptRow label="Player ID" value={p.order.playerId} />
          </div>

          {p.status !== 'PENDING' ? (
            <div className="mt-8 space-y-4">
              <p className="flex items-center justify-between text-sm">
                This payment is <StatusBadge status={p.status} />
              </p>
              <button className="btn-primary w-full" onClick={() => router.push(`/orders/${orderId}`)}>
                Back to your order
              </button>
            </div>
          ) : (
            <div className="mt-8 space-y-3">
              <ErrorBox message={actionError} />
              <button className="btn h-12 w-full bg-info text-white hover:bg-info/90" disabled={!!pending} onClick={() => complete('success')}>
                {pending === 'success' && <Spinner />} Approve payment
              </button>
              <button className="btn-secondary w-full" disabled={!!pending} onClick={() => complete('failure')}>
                {pending === 'failure' && <Spinner />} Decline (simulate a failed card)
              </button>
            </div>
          )}
        </div>
        <p className="border-t border-ink/10 bg-bg/60 px-6 py-3 text-xs leading-relaxed text-muted">
          Simulated gateway — no card details are requested and no money moves. Your choice is sent to the store as a signed webhook.
        </p>
      </div>
      <details className="mt-6 text-xs text-muted">
        <summary className="cursor-pointer">Testing delivery problems</summary>
        <p className="mt-2 leading-relaxed">
          Player IDs ending in <code className="font-mono">9999</code> simulate a supplier timeout, <code className="font-mono">7777</code> a temporary error that
          succeeds on retry, and <code className="font-mono">8888</code> a permanent failure.
        </p>
      </details>
    </div>
  );
}

export default function MockPayPage() {
  return (
    <Suspense fallback={<Loading />}>
      <MockPay />
    </Suspense>
  );
}
