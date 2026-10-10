'use client';

import { isTerminalStatus } from '@donat/shared';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { gameColor } from '@/components/game-art';
import { OrderTracker } from '@/components/order-tracker';
import { ReceiptRow } from '@/components/receipt';
import { ErrorBox, Loading, Spinner, StatusBadge } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import { dateTime, money } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { CustomerOrder } from '@/lib/types';

function headline(o: CustomerOrder): [string, string] {
  const who = o.playerNickname ?? `player ${o.playerId}`;
  switch (o.status) {
    case 'AWAITING_PAYMENT':
    case 'CREATED':
      return ['Waiting for payment.', 'Your order is reserved. Pay to start the delivery.'];
    case 'PAID':
    case 'QUEUED':
      return ['Payment received.', `Your top-up is next in line for ${who}.`];
    case 'PROCESSING':
      return ['Delivering now…', `Sending to ${who}. This page updates by itself.`];
    case 'FULFILLED':
      return ['Delivered.', `Open the game — ${who} should see it in their balance.`];
    case 'MANUAL_REVIEW':
      return ['We’re checking this one.', 'Your payment is safe. A person on our team is confirming the delivery with the supplier.'];
    case 'FAILED':
      return ['Delivery didn’t go through.', 'Nothing was delivered, so you’ll be refunded. Our team has been notified.'];
    case 'REFUND_PENDING':
      return ['Refund on its way.', 'We’ve asked the payment provider to return your money.'];
    case 'REFUNDED':
      return ['Refunded.', 'The money is on its way back to your original payment method.'];
    case 'CANCELLED':
      return ['Cancelled.', 'This order was cancelled before payment. Nothing was charged.'];
  }
}

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { allowed } = useRequireAuth();
  const [poll, setPoll] = useState(true);
  const { data, error, loading, reload } = useApi<{ order: CustomerOrder }>(allowed ? `/orders/${id}` : null, poll ? 2500 : undefined);
  const [busy, setBusy] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const order = data?.order;

  if (order && isTerminalStatus(order.status) && poll) setPoll(false);

  async function pay() {
    setBusy('pay');
    setActionError(undefined);
    try {
      const res = await api<{ payment: { id: string } }>(`/orders/${id}/pay`, { method: 'POST' });
      router.push(`/checkout/${id}/pay?payment=${res.payment.id}`);
    } catch (err) {
      setActionError(errorMessage(err));
      setBusy(undefined);
    }
  }

  async function cancel() {
    setBusy('cancel');
    setActionError(undefined);
    try {
      await api(`/orders/${id}/cancel`, { method: 'POST' });
      await reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(undefined);
    }
  }

  if (!allowed || (loading && !order)) return <Loading />;
  if (error || !order) return <ErrorBox message={error ?? 'Order not found'} />;

  const item = order.items[0];
  const [title, sub] = headline(order);
  const color = gameColor(order.game.slug);
  const live = !isTerminalStatus(order.status) && !['AWAITING_PAYMENT', 'FAILED', 'MANUAL_REVIEW'].includes(order.status);

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_380px]">
      <div>
        <div className="mb-8 flex flex-wrap items-center gap-3 font-mono text-xs text-muted">
          <Link href="/account/orders" className="hover:text-text">
            ← Orders
          </Link>
          <span>/</span>
          <span className="text-text">{order.orderNumber}</span>
          <StatusBadge status={order.status} label={order.statusLabel} />
          {live && <span className="text-muted">· live</span>}
        </div>

        <h1 className="text-4xl leading-[1] font-extrabold tracking-[-0.04em] sm:text-6xl">{title}</h1>
        <p className="mt-4 max-w-lg text-[17px] leading-relaxed text-muted">{sub}</p>

        <ErrorBox message={actionError} />
        {(order.canPay || order.canCancel) && (
          <div className="mt-6 flex flex-wrap gap-3">
            {order.canPay && (
              <button className="btn-accent h-12 px-6" onClick={pay} disabled={!!busy}>
                {busy === 'pay' && <Spinner />} Pay {money(order.totalMinor, order.currency)}
              </button>
            )}
            {order.canCancel && (
              <button className="btn-ghost h-12" onClick={cancel} disabled={!!busy}>
                {busy === 'cancel' && <Spinner />} Cancel order
              </button>
            )}
          </div>
        )}
        {(order.status === 'FAILED' || order.status === 'MANUAL_REVIEW') && (
          <Link className="btn-secondary mt-6" href={`/account/support?order=${order.id}`}>
            Ask support about this order
          </Link>
        )}

        <div className="mt-12 max-w-md">
          <p className="eyebrow mb-5">Progress</p>
          <OrderTracker status={order.status} timeline={order.timeline} />
        </div>

        <details className="mt-10 max-w-lg">
          <summary className="eyebrow cursor-pointer">Full history ({order.timeline.length})</summary>
          <ul className="mt-4 space-y-3 border-l border-ink/15 pl-4">
            {order.timeline.map((t, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium">{t.label}</span>
                {t.message && <span className="text-muted"> — {t.message}</span>}
                <p className="font-mono text-xs text-muted">{dateTime(t.at)}</p>
              </li>
            ))}
          </ul>
        </details>
      </div>

      <aside className="lg:pt-14">
        <div className="bg-surface shadow-[0_1px_0_rgba(22,21,19,0.06),0_16px_36px_-24px_rgba(22,21,19,0.5)]">
          <div className="flex items-center justify-between px-5 py-3 font-mono text-[11px] tracking-wide uppercase" style={{ background: color.bg, color: color.fg }}>
            <span>{order.game.name}</span>
            <span className="opacity-75">{order.game.currencyName}</span>
          </div>
          <div className="px-5 pt-4 pb-5">
            <p className="font-display text-2xl font-bold tracking-tight">{item?.productName}</p>
            <div className="rule-dashed my-4" />
            <div className="space-y-2">
              <ReceiptRow label={order.game.playerIdLabel} value={`${order.playerId}${order.serverId ? ` · ${order.serverId}` : ''}`} />
              <ReceiptRow label="Nickname" value={order.playerNickname ?? '—'} />
              <ReceiptRow label="Placed" value={dateTime(order.createdAt)} />
              {order.paidAt && <ReceiptRow label="Paid" value={dateTime(order.paidAt)} />}
              {order.fulfilledAt && <ReceiptRow label="Delivered" value={dateTime(order.fulfilledAt)} />}
            </div>
            <div className="rule-dashed my-4" />
            <div className="space-y-2">
              <ReceiptRow label="Subtotal" value={money(order.subtotalMinor, order.currency)} />
              {order.discountMinor > 0 && <ReceiptRow label="Discount" value={`−${money(order.discountMinor, order.currency)}`} />}
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="font-mono text-[13px] text-muted">Total</span>
              <span className="font-display text-2xl font-bold tabular-nums">{money(order.totalMinor, order.currency)}</span>
            </div>
            {order.payments.length > 0 && (
              <>
                <div className="rule-dashed my-4" />
                <p className="eyebrow mb-2">Payments</p>
                <ul className="space-y-1.5">
                  {order.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between font-mono text-xs">
                      <span className="text-muted">{dateTime(p.createdAt)}</span>
                      <StatusBadge status={p.status} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
        <div className="receipt-edge" />
      </aside>
    </div>
  );
}
