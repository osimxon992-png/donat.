'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { ErrorBox, Field, Loading, PageHeader, Spinner, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime, money } from '@/lib/format';
import { useAction, useApi } from '@/lib/hooks';
import type { ProviderRow } from '@/lib/types';

export default function ProvidersPage() {
  const { can } = useAuth();
  const { data, error, loading, reload } = useApi<{ providers: ProviderRow[]; realFulfillmentEnabled: boolean }>('/admin/providers', 30_000);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', type: 'AUTHORIZED_HTTP', priority: '100' });
  const create = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await create.run(() =>
      api('/admin/providers', { method: 'POST', body: { ...form, priority: Number(form.priority), isEnabled: false } }),
    );
    if (ok) {
      setShow(false);
      setForm({ code: '', name: '', type: 'AUTHORIZED_HTTP', priority: '100' });
      await reload();
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Top-up providers"
        subtitle="Suppliers that deliver in-game currency. Lower priority number is tried first."
        actions={
          can('providers:write') && (
            <button className="btn-primary" onClick={() => setShow((s) => !s)}>
              {show ? 'Close' : 'Add provider'}
            </button>
          )
        }
      />
      {data && !data.realFulfillmentEnabled && (
        <div className="rounded-[8px] border border-warn/40 bg-warn/10 p-4 text-sm text-warn">
          Real fulfillment is disabled (<code>ENABLE_REAL_FULFILLMENT=false</code>). Only the mock supplier can deliver, and it delivers nothing real.
          A real supplier additionally needs a signed reseller agreement, its official API documentation, an adapter implemented from that
          documentation, and credentials in environment variables.
        </div>
      )}
      {show && (
        <form onSubmit={submit} className="card grid gap-4 p-5 sm:grid-cols-4 sm:items-end">
          <Field label="Code">
            <input className="input" required pattern="[a-z0-9_-]{2,32}" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase() })} />
          </Field>
          <Field label="Name">
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Type">
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="AUTHORIZED_HTTP">Authorized supplier (HTTP)</option>
              <option value="MOCK">Mock (simulated)</option>
            </select>
          </Field>
          <Field label="Priority">
            <input className="input" type="number" min={0} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
          </Field>
          <div className="sm:col-span-4">
            <ErrorBox message={create.error} />
            <button className="btn-primary mt-2" disabled={create.pending}>
              {create.pending && <Spinner />} Create (disabled until configured)
            </button>
          </div>
        </form>
      )}
      <ErrorBox message={error} />
      {loading && !data ? (
        <Loading />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data?.providers.map((p) => (
            <Link key={p.id} href={`/admin/providers/${p.id}`} className="card space-y-3 p-5 hover:border-muted">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{p.name}</p>
                  <p className="font-mono text-xs text-muted">
                    {p.code} · {p.type} · priority {p.priority}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge status={p.isEnabled ? 'ACTIVE' : 'CANCELLED'} label={p.isEnabled ? 'Enabled' : 'Disabled'} />
                  <StatusBadge status={p.health} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <p className="text-xs text-muted">Balance</p>
                  <p className="tabular-nums">{p.balanceMinor !== null ? money(p.balanceMinor, p.balanceCurrency) : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted">Mapped products</p>
                  <p>{p._count.products}</p>
                </div>
                <div>
                  <p className="text-xs text-muted">Attempts</p>
                  <p>{p._count.attempts}</p>
                </div>
              </div>
              <p className="text-xs text-muted">Last check: {dateTime(p.lastHealthCheckAt)}</p>
              {p.blocker && <p className="text-xs text-warn">Not usable: {p.blocker}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
