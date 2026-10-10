'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { JsonView } from '@/components/json-view';
import { DefinitionList, ErrorBox, Field, Loading, PageHeader, Spinner, StatusBadge, SuccessBox } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime, money } from '@/lib/format';
import { useAction, useApi } from '@/lib/hooks';

interface AdminOrder {
  order: {
    id: string;
    orderNumber: string;
    status: string;
    statusLabel: string;
    currency: string;
    subtotalMinor: number;
    discountMinor: number;
    totalMinor: number;
    costMinor: number;
    playerId: string;
    serverId: string;
    playerNickname: string | null;
    failureReason: string | null;
    createdAt: string;
    paidAt: string | null;
    fulfilledAt: string | null;
    user: { id: string; email: string; name: string };
    game: { name: string; slug: string };
    items: { productName: string; sku: string; quantity: number; unitPriceMinor: number; unitCostMinor: number }[];
    events: { id: string; fromStatus: string | null; toStatus: string; message: string | null; actorId: string | null; createdAt: string }[];
    payments: {
      id: string;
      provider: string;
      providerPaymentId: string | null;
      status: string;
      amountMinor: number;
      currency: string;
      failureReason: string | null;
      createdAt: string;
      paidAt: string | null;
      transactions: { id: string; type: string; status: string; amountMinor: number; providerTransactionId: string | null; createdAt: string }[];
    }[];
    attempts: {
      id: string;
      attemptNumber: number;
      status: string;
      externalReference: string;
      supplierOrderId: string | null;
      errorCode: string | null;
      errorMessage: string | null;
      durationMs: number | null;
      reconcileChecks: number;
      startedAt: string;
      reconciledAt: string | null;
      responsePayload: unknown;
      provider: { code: string; name: string };
    }[];
    refunds: { id: string; status: string; amountMinor: number; currency: string; reason: string; failureReason: string | null; createdAt: string }[];
    promotion: { code: string } | null;
  };
  providerLogs: { id: string; operation: string; success: boolean; durationMs: number; createdAt: string; requestSummary: unknown; responseSummary: unknown; errorMessage: string | null }[];
  actions: { canRetry: boolean; canReconcile: boolean; canRefund: boolean; canMarkFulfilled: boolean; canMarkReview: boolean };
}

type ActionKind = 'retry' | 'reconcile' | 'refund' | 'review' | 'fulfilled';

export default function AdminOrderPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const { data, error, loading, reload } = useApi<AdminOrder>(`/admin/orders/${id}`, 10_000);
  const action = useAction();
  const [open, setOpen] = useState<ActionKind>();
  const [text, setText] = useState('');
  const [done, setDone] = useState<string>();

  async function perform(kind: ActionKind) {
    setDone(undefined);
    const paths: Record<ActionKind, [string, unknown]> = {
      retry: [`/admin/orders/${id}/retry`, undefined],
      reconcile: [`/admin/orders/${id}/reconcile`, undefined],
      refund: [`/admin/orders/${id}/refund`, { reason: text }],
      review: [`/admin/orders/${id}/manual-review`, { note: text }],
      fulfilled: [`/admin/orders/${id}/mark-fulfilled`, { note: text }],
    };
    const [path, body] = paths[kind];
    const res = await action.run(() => api<{ summary?: { outcome: string; details: string[] } }>(path, { method: 'POST', body }));
    if (res) {
      setDone(res.summary ? `Reconciliation: ${res.summary.outcome}. ${res.summary.details.join('; ')}` : 'Done.');
      setOpen(undefined);
      setText('');
      await reload();
    }
  }

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error} />;
  const { order: o, actions } = data;
  const item = o.items[0];
  const needsText = open === 'refund' || open === 'review' || open === 'fulfilled';

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Order ${o.orderNumber}`}
        subtitle={
          <>
            {item?.productName} · {o.game.name} · <Link className="link" href={`/admin/users/${o.user.id}`}>{o.user.email}</Link>
          </>
        }
        actions={<StatusBadge status={o.status} label={o.statusLabel} />}
      />

      {o.failureReason && <ErrorBox message={`Reason: ${o.failureReason}`} />}
      <SuccessBox message={done} />
      <ErrorBox message={action.error} />

      {can('orders:manage') && (
        <div className="card space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" disabled={!actions.canReconcile || action.pending} onClick={() => perform('reconcile')} title="Ask the supplier what happened to unresolved attempts">
              Reconcile with supplier
            </button>
            <button className="btn-secondary" disabled={!actions.canRetry || action.pending} onClick={() => perform('retry')}>
              Retry delivery
            </button>
            <button className="btn-secondary" disabled={!actions.canMarkReview || action.pending} onClick={() => setOpen('review')}>
              Send to manual review
            </button>
            <button className="btn-secondary" disabled={!actions.canMarkFulfilled || action.pending} onClick={() => setOpen('fulfilled')}>
              Mark delivered
            </button>
            {can('orders:refund') && (
              <button className="btn-danger" disabled={!actions.canRefund || action.pending} onClick={() => setOpen('refund')}>
                Refund
              </button>
            )}
            {action.pending && <Spinner className="self-center" />}
          </div>
          {actions.canReconcile && (
            <p className="text-xs text-warn">An attempt has an unknown outcome. Reconcile before retrying or refunding to avoid a duplicate top-up.</p>
          )}
          {needsText && (
            <div className="space-y-2 rounded-[8px] border border-border p-3">
              <Field
                label={open === 'refund' ? 'Refund reason' : open === 'fulfilled' ? 'How was delivery verified? (supplier reference)' : 'Note'}
              >
                <input className="input" value={text} onChange={(e) => setText(e.target.value)} minLength={3} maxLength={500} />
              </Field>
              <div className="flex gap-2">
                <button className={open === 'refund' ? 'btn-danger' : 'btn-primary'} disabled={text.trim().length < 3 || action.pending} onClick={() => perform(open!)}>
                  Confirm {open === 'refund' ? `refund of ${money(o.totalMinor, o.currency)}` : ''}
                </button>
                <button className="btn-ghost" onClick={() => setOpen(undefined)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-4 font-semibold">Order</h2>
          <DefinitionList
            items={[
              ['Player ID', `${o.playerId}${o.serverId ? ` (${o.serverId})` : ''}`],
              ['Nickname', o.playerNickname ?? '—'],
              ['SKU', item?.sku ?? '—'],
              ['Subtotal', money(o.subtotalMinor, o.currency)],
              ['Discount', o.discountMinor ? `−${money(o.discountMinor, o.currency)}${o.promotion ? ` (${o.promotion.code})` : ''}` : '—'],
              ['Total', money(o.totalMinor, o.currency)],
              ['Supplier cost', money(o.costMinor, o.currency)],
              ['Gross profit', money(o.totalMinor - o.costMinor, o.currency)],
              ['Created', dateTime(o.createdAt)],
              ['Paid', dateTime(o.paidAt)],
              ['Delivered', dateTime(o.fulfilledAt)],
            ]}
          />
        </div>
        <div className="card p-5">
          <h2 className="mb-4 font-semibold">Status history</h2>
          <ol className="space-y-3 border-l border-border pl-4 text-sm">
            {o.events.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-accent" />
                <p className="font-medium">
                  {e.fromStatus && e.fromStatus !== e.toStatus ? `${e.fromStatus} → ` : ''}
                  {e.toStatus}
                </p>
                {e.message && <p className="text-xs text-muted">{e.message}</p>}
                <p className="text-xs text-muted">
                  {dateTime(e.createdAt)}
                  {e.actorId ? ' · by staff/customer' : ' · system'}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <section className="card overflow-x-auto p-5">
        <h2 className="mb-3 font-semibold">Payments</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Created</th>
              <th>Provider</th>
              <th>Gateway ID</th>
              <th className="text-right">Amount</th>
              <th>Status</th>
              <th>Transactions</th>
            </tr>
          </thead>
          <tbody>
            {o.payments.map((p) => (
              <tr key={p.id}>
                <td className="whitespace-nowrap">{dateTime(p.createdAt)}</td>
                <td>{p.provider}</td>
                <td className="font-mono text-xs">{p.providerPaymentId ?? '—'}</td>
                <td className="text-right tabular-nums">{money(p.amountMinor, p.currency)}</td>
                <td>
                  <StatusBadge status={p.status} />
                  {p.failureReason && <p className="text-xs text-muted">{p.failureReason}</p>}
                </td>
                <td className="text-xs text-muted">
                  {p.transactions.map((t) => (
                    <div key={t.id}>
                      {t.type} {t.status} {money(t.amountMinor, p.currency)}
                    </div>
                  ))}
                  {p.status === 'PENDING' && can('orders:manage') && (
                    <button
                      className="link mt-1"
                      onClick={async () => {
                        const r = await action.run(() => api<{ changed: boolean }>(`/admin/payments/${p.id}/reconcile`, { method: 'POST' }));
                        if (r) {
                          setDone(r.changed ? 'Payment status updated from the gateway.' : 'Gateway reports no change.');
                          await reload();
                        }
                      }}
                    >
                      Check with gateway
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Fulfillment attempts</h2>
        {o.attempts.length === 0 && <p className="text-sm text-muted">No delivery attempts yet.</p>}
        {o.attempts.map((a) => (
          <div key={a.id} className="rounded-[8px] border border-border p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">
                Attempt #{a.attemptNumber} via {a.provider.name}
              </p>
              <StatusBadge status={a.status} />
            </div>
            <DefinitionList
              items={[
                ['External reference', <span key="r" className="font-mono text-xs">{a.externalReference}</span>],
                ['Supplier order ID', a.supplierOrderId ?? '—'],
                ['Error', a.errorCode ? `${a.errorCode}: ${a.errorMessage ?? ''}` : '—'],
                ['Duration', a.durationMs !== null ? `${a.durationMs} ms` : '—'],
                ['Started', dateTime(a.startedAt)],
                ['Reconciled', a.reconciledAt ? `${dateTime(a.reconciledAt)} (${a.reconcileChecks} checks)` : a.reconcileChecks ? `${a.reconcileChecks} checks so far` : '—'],
              ]}
            />
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-muted">Supplier response</summary>
              <JsonView value={a.responsePayload} />
            </details>
          </div>
        ))}
      </section>

      {o.refunds.length > 0 && (
        <section className="card overflow-x-auto p-5">
          <h2 className="mb-3 font-semibold">Refunds</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Created</th>
                <th>Reason</th>
                <th className="text-right">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {o.refunds.map((r) => (
                <tr key={r.id}>
                  <td>{dateTime(r.createdAt)}</td>
                  <td>
                    {r.reason}
                    {r.failureReason && <p className="text-xs text-bad">{r.failureReason}</p>}
                  </td>
                  <td className="text-right tabular-nums">{money(r.amountMinor, r.currency)}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card overflow-x-auto p-5">
        <h2 className="mb-3 font-semibold">Provider API log</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Operation</th>
              <th>Result</th>
              <th>Duration</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {data.providerLogs.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap">{dateTime(l.createdAt)}</td>
                <td>{l.operation}</td>
                <td>
                  <StatusBadge status={l.success ? 'SUCCEEDED' : 'FAILED'} />
                </td>
                <td className="tabular-nums">{l.durationMs} ms</td>
                <td>
                  <details>
                    <summary className="cursor-pointer text-xs text-muted">View</summary>
                    <JsonView value={{ request: l.requestSummary, response: l.responseSummary, error: l.errorMessage }} />
                  </details>
                </td>
              </tr>
            ))}
            {data.providerLogs.length === 0 && (
              <tr>
                <td colSpan={5} className="text-muted">
                  No provider calls for this order.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
