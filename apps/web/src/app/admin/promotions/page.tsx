'use client';

import { decimalStringToMinor } from '@donat/shared';
import { useState, type FormEvent } from 'react';
import { EmptyState, ErrorBox, Field, Loading, PageHeader, Spinner, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { bps, date, money } from '@/lib/format';
import { useAction, useApi } from '@/lib/hooks';

interface Promotion {
  id: string;
  code: string;
  description: string | null;
  type: 'PERCENT' | 'FIXED';
  percentBps: number | null;
  amountMinor: number | null;
  currency: string;
  minOrderMinor: number | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  perUserLimit: number | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  game: { name: string } | null;
}

const EMPTY = { code: '', description: '', type: 'PERCENT' as 'PERCENT' | 'FIXED', value: '', minOrder: '', maxRedemptions: '', perUserLimit: '1', gameId: '', endsAt: '' };

export default function PromotionsPage() {
  const { can } = useAuth();
  const canWrite = can('promotions:write');
  const { data, error, loading, reload } = useApi<{ promotions: Promotion[] }>('/admin/promotions');
  const games = useApi<{ games: { id: string; name: string }[] }>('/admin/games');
  const [form, setForm] = useState(EMPTY);
  const [show, setShow] = useState(false);
  const create = useAction();
  const update = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await create.run(() =>
      api('/admin/promotions', {
        method: 'POST',
        body: {
          code: form.code,
          description: form.description || null,
          type: form.type,
          // percent "10" -> 1000 bps; fixed "1.50" -> 150 minor units (exact decimal parsing)
          percentBps: form.type === 'PERCENT' ? decimalStringToMinor(form.value, 'USD') : null,
          amountMinor: form.type === 'FIXED' ? decimalStringToMinor(form.value, 'USD') : null,
          minOrderMinor: form.minOrder ? decimalStringToMinor(form.minOrder, 'USD') : null,
          maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
          perUserLimit: form.perUserLimit ? Number(form.perUserLimit) : null,
          gameId: form.gameId || null,
          endsAt: form.endsAt ? new Date(`${form.endsAt}T23:59:59`).toISOString() : null,
        },
      }),
    );
    if (ok) {
      setForm(EMPTY);
      setShow(false);
      await reload();
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Promotions"
        actions={
          canWrite && (
            <button className="btn-primary" onClick={() => setShow((s) => !s)}>
              {show ? 'Close' : 'New promotion'}
            </button>
          )
        }
      />
      {show && (
        <form onSubmit={submit} className="card grid gap-4 p-5 sm:grid-cols-3">
          <Field label="Code">
            <input className="input uppercase" required pattern="[A-Za-z0-9_-]{3,32}" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="Type">
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'PERCENT' | 'FIXED' })}>
              <option value="PERCENT">Percent off</option>
              <option value="FIXED">Fixed amount off (USD)</option>
            </select>
          </Field>
          <Field label={form.type === 'PERCENT' ? 'Percent (e.g. 10 or 12.5)' : 'Amount (e.g. 1.50)'}>
            <input className="input" required inputMode="decimal" pattern="\d+(\.\d{1,2})?" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
          </Field>
          <Field label="Minimum order (optional)">
            <input className="input" inputMode="decimal" pattern="\d+(\.\d{1,2})?" value={form.minOrder} onChange={(e) => setForm({ ...form, minOrder: e.target.value })} />
          </Field>
          <Field label="Total redemptions limit">
            <input className="input" type="number" min={1} value={form.maxRedemptions} onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })} placeholder="Unlimited" />
          </Field>
          <Field label="Per-customer limit">
            <input className="input" type="number" min={1} value={form.perUserLimit} onChange={(e) => setForm({ ...form, perUserLimit: e.target.value })} placeholder="Unlimited" />
          </Field>
          <Field label="Only for game">
            <select className="input" value={form.gameId} onChange={(e) => setForm({ ...form, gameId: e.target.value })}>
              <option value="">All games</option>
              {games.data?.games.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ends on (optional)">
            <input className="input" type="date" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
          </Field>
          <Field label="Description">
            <input className="input" value={form.description} maxLength={200} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <div className="sm:col-span-3">
            <ErrorBox message={create.error} />
            <button className="btn-primary mt-2" disabled={create.pending}>
              {create.pending && <Spinner />} Create promotion
            </button>
          </div>
        </form>
      )}
      <ErrorBox message={error ?? update.error} />
      {loading && !data ? (
        <Loading />
      ) : !data?.promotions.length ? (
        <EmptyState title="No promotions" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>Scope</th>
                <th className="text-right">Used</th>
                <th>Ends</th>
                <th>Status</th>
                {canWrite && <th />}
              </tr>
            </thead>
            <tbody>
              {data.promotions.map((p) => (
                <tr key={p.id}>
                  <td>
                    <span className="font-mono font-semibold">{p.code}</span>
                    {p.description && <p className="text-xs text-muted">{p.description}</p>}
                  </td>
                  <td>
                    {p.type === 'PERCENT' ? bps(p.percentBps) : money(p.amountMinor, p.currency)}
                    {p.minOrderMinor ? <p className="text-xs text-muted">min {money(p.minOrderMinor, p.currency)}</p> : null}
                  </td>
                  <td className="text-sm text-muted">
                    {p.game?.name ?? 'All games'}
                    {p.perUserLimit ? ` · ${p.perUserLimit}/customer` : ''}
                  </td>
                  <td className="text-right tabular-nums">
                    {p.redemptionCount}
                    {p.maxRedemptions ? ` / ${p.maxRedemptions}` : ''}
                  </td>
                  <td>{date(p.endsAt)}</td>
                  <td>
                    <StatusBadge status={p.isActive ? 'ACTIVE' : 'CANCELLED'} label={p.isActive ? 'Active' : 'Inactive'} />
                  </td>
                  {canWrite && (
                    <td className="whitespace-nowrap text-right">
                      <button
                        className="btn-ghost px-2 py-1 text-xs"
                        onClick={async () => {
                          const ok = await update.run(() => api(`/admin/promotions/${p.id}`, { method: 'PATCH', body: { isActive: !p.isActive } }));
                          if (ok) await reload();
                        }}
                      >
                        {p.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        className="btn-ghost px-2 py-1 text-xs text-bad"
                        onClick={async () => {
                          if (!window.confirm(`Delete promotion ${p.code}? Used codes are deactivated instead.`)) return;
                          const ok = await update.run(() => api(`/admin/promotions/${p.id}`, { method: 'DELETE' }));
                          if (ok) await reload();
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
