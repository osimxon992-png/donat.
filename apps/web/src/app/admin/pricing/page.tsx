'use client';

import { decimalStringToMinor, minorToDecimalString } from '@donat/shared';
import { Fragment, useState, type FormEvent } from 'react';
import { ErrorBox, Field, Loading, PageHeader, Spinner, SuccessBox } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { bps, money } from '@/lib/format';
import { useAction, useApi } from '@/lib/hooks';

interface PricingRow {
  id: string;
  sku: string;
  name: string;
  isActive: boolean;
  game: { id: string; name: string };
  price: { currency: string; costMinor: number; priceMinor: number; pricingMode: 'FIXED' | 'MARKUP'; markupBps: number | null } | null;
  marginBps: number | null;
  profitMinor: number | null;
  supplierCosts: { costMinor: number; currency: string; provider: { code: string } }[];
}

/** "12.5" (percent) -> 1250 bps, using the exact 2-decimal parser (no floats). */
const percentToBps = (s: string) => decimalStringToMinor(s, 'USD');
const bpsToPercent = (b: number) => minorToDecimalString(b, 'USD');

export default function PricingPage() {
  const { can } = useAuth();
  const canWrite = can('pricing:write');
  const { data, error, loading, reload } = useApi<{ products: PricingRow[] }>('/admin/pricing');
  const games = useApi<{ games: { id: string; name: string }[] }>('/admin/games');
  const [editing, setEditing] = useState<string>();
  const [form, setForm] = useState({ cost: '', mode: 'FIXED' as 'FIXED' | 'MARKUP', price: '', markup: '' });
  const [bulk, setBulk] = useState({ markup: '15', gameId: '' });
  const [message, setMessage] = useState<string>();
  const save = useAction();
  const bulkAction = useAction();

  function startEdit(r: PricingRow) {
    const cur = r.price?.currency ?? 'USD';
    setEditing(r.id);
    setForm({
      cost: r.price ? minorToDecimalString(r.price.costMinor, cur) : '',
      mode: r.price?.pricingMode ?? 'FIXED',
      price: r.price ? minorToDecimalString(r.price.priceMinor, cur) : '',
      markup: r.price?.markupBps !== null && r.price?.markupBps !== undefined ? bpsToPercent(r.price.markupBps) : '15',
    });
  }

  async function saveRow(r: PricingRow) {
    const currency = r.price?.currency ?? 'USD';
    const ok = await save.run(() =>
      api(`/admin/products/${r.id}/price`, {
        method: 'PUT',
        body: {
          currency,
          costMinor: decimalStringToMinor(form.cost, currency),
          pricingMode: form.mode,
          ...(form.mode === 'FIXED' ? { priceMinor: decimalStringToMinor(form.price, currency) } : { markupBps: percentToBps(form.markup) }),
        },
      }),
    );
    if (ok) {
      setEditing(undefined);
      setMessage(`Price for ${r.sku} updated.`);
      await reload();
    }
  }

  async function applyBulk(e: FormEvent) {
    e.preventDefault();
    const res = await bulkAction.run(() =>
      api<{ updated: number }>('/admin/pricing/apply-markup', {
        method: 'POST',
        body: { markupBps: percentToBps(bulk.markup), gameId: bulk.gameId || undefined },
      }),
    );
    if (res) {
      setMessage(`Markup applied to ${res.updated} packages.`);
      await reload();
    }
  }

  const grouped = new Map<string, PricingRow[]>();
  for (const r of data?.products ?? []) grouped.set(r.game.name, [...(grouped.get(r.game.name) ?? []), r]);

  return (
    <div className="space-y-6">
      <PageHeader title="Pricing" subtitle="Every change creates a new price version; orders keep the price they were placed at." />
      <SuccessBox message={message} />
      {canWrite && (
        <form onSubmit={applyBulk} className="card flex flex-wrap items-end gap-3 p-4">
          <Field label="Dynamic pricing: markup %">
            <input className="input w-32" required inputMode="decimal" pattern="\d+(\.\d{1,2})?" value={bulk.markup} onChange={(e) => setBulk({ ...bulk, markup: e.target.value })} />
          </Field>
          <Field label="Apply to">
            <select className="input w-56" value={bulk.gameId} onChange={(e) => setBulk({ ...bulk, gameId: e.target.value })}>
              <option value="">All games</option>
              {games.data?.games.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
          <button className="btn-secondary" disabled={bulkAction.pending}>
            {bulkAction.pending && <Spinner />} Recalculate prices from cost
          </button>
          <ErrorBox message={bulkAction.error} />
        </form>
      )}
      <ErrorBox message={error ?? save.error} />
      {loading && !data ? (
        <Loading />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Package</th>
                <th className="text-right">Supplier cost</th>
                <th>Mode</th>
                <th className="text-right">Selling price</th>
                <th className="text-right">Profit</th>
                <th className="text-right">Margin</th>
                {canWrite && <th />}
              </tr>
            </thead>
            <tbody>
              {[...grouped.entries()].map(([game, rows]) => (
                <Fragment key={game}>
                  <tr>
                    <td colSpan={7} className="bg-surface-2/60 text-xs font-semibold uppercase tracking-wide text-muted">
                      {game}
                    </td>
                  </tr>
                  {rows.map((r) => {
                    const cur = r.price?.currency ?? 'USD';
                    if (editing === r.id) {
                      return (
                        <tr key={r.id}>
                          <td>
                            {r.name} <span className="font-mono text-xs text-muted">{r.sku}</span>
                          </td>
                          <td className="text-right">
                            <input className="input w-24 py-1 text-right" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
                          </td>
                          <td>
                            <select className="input w-28 py-1" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as 'FIXED' | 'MARKUP' })}>
                              <option value="FIXED">Fixed</option>
                              <option value="MARKUP">Markup</option>
                            </select>
                          </td>
                          <td className="text-right">
                            {form.mode === 'FIXED' ? (
                              <input className="input w-24 py-1 text-right" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                <input className="input w-20 py-1 text-right" value={form.markup} onChange={(e) => setForm({ ...form, markup: e.target.value })} />%
                              </span>
                            )}
                          </td>
                          <td colSpan={2} className="text-right text-xs text-muted">
                            {cur}
                          </td>
                          <td className="whitespace-nowrap text-right">
                            <button className="btn-primary px-2 py-1 text-xs" disabled={save.pending} onClick={() => saveRow(r)}>
                              Save
                            </button>
                            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditing(undefined)}>
                              Cancel
                            </button>
                          </td>
                        </tr>
                      );
                    }
                    const lowMargin = r.marginBps !== null && r.marginBps < 500;
                    return (
                      <tr key={r.id} className={r.isActive ? '' : 'opacity-50'}>
                        <td>
                          {r.name} <span className="font-mono text-xs text-muted">{r.sku}</span>
                          {r.supplierCosts.some((s) => r.price && s.costMinor > r.price.costMinor) && (
                            <p className="text-xs text-warn">A supplier cost is higher than the recorded cost.</p>
                          )}
                        </td>
                        <td className="text-right tabular-nums">{r.price ? money(r.price.costMinor, cur) : '—'}</td>
                        <td className="text-xs text-muted">
                          {r.price?.pricingMode === 'MARKUP' ? `Markup ${bps(r.price.markupBps)}` : r.price ? 'Fixed' : '—'}
                        </td>
                        <td className="text-right font-medium tabular-nums">{r.price ? money(r.price.priceMinor, cur) : <span className="text-warn">Not priced</span>}</td>
                        <td className="text-right tabular-nums">{money(r.profitMinor, cur)}</td>
                        <td className={`text-right tabular-nums ${lowMargin ? 'text-warn' : ''}`}>{bps(r.marginBps)}</td>
                        {canWrite && (
                          <td className="text-right">
                            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => startEdit(r)}>
                              Edit
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
