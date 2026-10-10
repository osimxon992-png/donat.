'use client';

import { isTerminalStatus } from '@donat/shared';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { GameArt } from '@/components/game-art';
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
  const live = !isTerminalStatus(order.status) && !['AWAITING_PAYMENT', 'FAILED', 'MANUAL_REVIEW'].includes(order.status);

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_380px]">
      <div>
        <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-muted">
          <Link href="/account/orders" className="hover:text-text">
            ← Orders
          </Link>
          <span>/</span>
          <span className="text-text">{order.orderNumber}</span>
          <StatusBadge status={order.status} label={order.statusLabel} />
          {live && <span className="text-muted">· live</span>}
        </div>

        <h1 className="text-5xl tracking-wider uppercase sm:text-7xl">{title}</h1>
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

        <div className="card mt-10 max-w-lg p-6">
          <p className="mb-5 font-display text-3xl tracking-wider uppercase">Progress</p>
          <OrderTracker status={order.status} timeline={order.timeline} />
        </div>

        <details className="mt-10 max-w-lg">
          <summary className="cursor-pointer text-sm font-medium text-muted hover:text-text">Full history ({order.timeline.length})</summary>
          <ul className="mt-4 space-y-3 border-l border-border pl-4">
            {order.timeline.map((t, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium">{t.label}</span>
                {t.message && <span className="text-muted"> — {t.message}</span>}
                <p className="text-xs text-muted">{dateTime(t.at)}</p>
              </li>
            ))}
          </ul>
        </details>
      </div>

      <aside className="lg:pt-12">
        <div className="card overflow-hidden">
          <div className="flex items-center gap-3 border-b-[3px] border-ink bg-pop px-5 py-4">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md border-[2.5px] border-ink">
              <GameArt name={order.game.name} slug={order.game.slug} imageUrl={order.game.imageUrl} variant="thumb" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-display text-2xl leading-none tracking-wide">{order.game.name}</p>
              <p className="truncate text-xs font-semibold">{order.game.currencyName}</p>
            </div>
          </div>
          <div className="px-5 pt-4 pb-5">
            <p className="font-display text-3xl tracking-wide">{item?.productName}</p>
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
              <span className="text-sm text-muted">Total</span>
              <span className="font-display text-4xl tracking-wide tabular-nums">{money(order.totalMinor, order.currency)}</span>
            </div>
            {order.payments.length > 0 && (
              <>
                <div className="rule-dashed my-4" />
                <p className="mb-2 text-sm font-semibold">Payments</p>
                <ul className="space-y-1.5">
                  {order.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between text-xs">
                      <span className="text-muted">{dateTime(p.createdAt)}</span>
                      <StatusBadge status={p.status} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
