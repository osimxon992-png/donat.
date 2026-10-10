'use client';

import { decimalStringToMinor, minorToDecimalString } from '@donat/shared';
import { useParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { JsonView } from '@/components/json-view';
import { DefinitionList, ErrorBox, Field, Loading, PageHeader, Pagination, Spinner, StatusBadge, SuccessBox } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime, money } from '@/lib/format';
import { useAction, useApi } from '@/lib/hooks';
import type { Paged, ProviderRow } from '@/lib/types';

interface Mapping {
  id: string;
  providerSku: string;
  costMinor: number;
  currency: string;
  isActive: boolean;
  product: { id: string; sku: string; name: string; game: { name: string } };
}

interface LogRow {
  id: string;
  operation: string;
  orderId: string | null;
  success: boolean;
  durationMs: number;
  requestSummary: unknown;
  responseSummary: unknown;
  errorMessage: string | null;
  createdAt: string;
}

export default function ProviderPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const canWrite = can('providers:write');
  const list = useApi<{ providers: ProviderRow[] }>('/admin/providers');
  const mappings = useApi<{ mappings: Mapping[] }>(`/admin/providers/${id}/products`);
  const products = useApi<{ products: { id: string; sku: string; name: string; game: { name: string } }[] }>('/admin/pricing');
  const [logPage, setLogPage] = useState(1);
  const [failedOnly, setFailedOnly] = useState(false);
  const logs = useApi<Paged<LogRow>>(`/admin/providers/${id}/logs?page=${logPage}&pageSize=20${failedOnly ? '&failedOnly=true' : ''}`);
  const provider = list.data?.providers.find((p) => p.id === id);

  const [cfg, setCfg] = useState({ name: '', priority: '', timeoutMs: '', baseUrl: '', credentialsEnvPrefix: '', isAuthorized: false, authorizationNote: '' });
  const [mapForm, setMapForm] = useState({ productId: '', providerSku: '', cost: '', currency: 'USD' });
  const [message, setMessage] = useState<string>();
  const save = useAction();
  const health = useAction();
  const mapAction = useAction();

  useEffect(() => {
    if (provider)
      setCfg({
        name: provider.name,
        priority: String(provider.priority),
        timeoutMs: String(provider.timeoutMs),
        baseUrl: provider.baseUrl ?? '',
        credentialsEnvPrefix: provider.credentialsEnvPrefix ?? '',
        isAuthorized: provider.isAuthorized,
        authorizationNote: provider.authorizationNote ?? '',
      });
  }, [provider]);

  if (list.loading && !list.data) return <Loading />;
  if (list.error || !provider) return <ErrorBox message={list.error ?? 'Provider not found'} />;
  const isReal = provider.type === 'AUTHORIZED_HTTP';

  async function patch(body: Record<string, unknown>, msg: string) {
    setMessage(undefined);
    const ok = await save.run(() => api(`/admin/providers/${id}`, { method: 'PATCH', body }));
    if (ok) {
      setMessage(msg);
      await list.reload();
    }
  }

  async function saveConfig(e: FormEvent) {
    e.preventDefault();
    await patch(
      {
        name: cfg.name,
        priority: Number(cfg.priority),
        timeoutMs: Number(cfg.timeoutMs),
        ...(isReal
          ? {
              baseUrl: cfg.baseUrl || null,
              credentialsEnvPrefix: cfg.credentialsEnvPrefix || null,
              isAuthorized: cfg.isAuthorized,
              authorizationNote: cfg.authorizationNote || null,
            }
          : {}),
      },
      'Configuration saved.',
    );
  }

  async function saveMapping(e: FormEvent) {
    e.preventDefault();
    const ok = await mapAction.run(() =>
      api(`/admin/providers/${id}/products/${mapForm.productId}`, {
        method: 'PUT',
        body: { providerSku: mapForm.providerSku, costMinor: decimalStringToMinor(mapForm.cost, mapForm.currency), currency: mapForm.currency },
      }),
    );
    if (ok) {
      setMapForm({ productId: '', providerSku: '', cost: '', currency: 'USD' });
      await mappings.reload();
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={provider.name}
        subtitle={<span className="font-mono">{provider.code} · {provider.type}</span>}
        actions={
          <>
            <StatusBadge status={provider.health} />
            {canWrite && (
              <>
                <button
                  className="btn-secondary"
                  disabled={health.pending}
                  onClick={async () => {
                    const ok = await health.run(() => api(`/admin/providers/${id}/health-check`, { method: 'POST' }));
                    if (ok) {
                      await list.reload();
                      await logs.reload();
                    }
                  }}
                >
                  {health.pending && <Spinner />} Check health & balance
                </button>
                <button
                  className={provider.isEnabled ? 'btn-danger' : 'btn-primary'}
                  disabled={save.pending}
                  onClick={() => patch({ isEnabled: !provider.isEnabled }, provider.isEnabled ? 'Provider disabled.' : 'Provider enabled.')}
                >
                  {provider.isEnabled ? 'Disable provider' : 'Enable provider'}
                </button>
              </>
            )}
          </>
        }
      />
      <SuccessBox message={message} />
      <ErrorBox message={save.error ?? health.error} />
      {provider.blocker && <ErrorBox message={`This provider cannot deliver: ${provider.blocker}`} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-4 font-semibold">Status</h2>
          <DefinitionList
            items={[
              ['Enabled', provider.isEnabled ? 'Yes' : 'No'],
              ['Health', provider.health],
              ['Balance', provider.balanceMinor !== null ? money(provider.balanceMinor, provider.balanceCurrency) : '—'],
              ['Last health check', dateTime(provider.lastHealthCheckAt)],
              ['Last error', provider.lastError ?? '—'],
              ['Delivery attempts', String(provider._count.attempts)],
            ]}
          />
        </div>
        <form onSubmit={saveConfig} className="card space-y-4 p-5">
          <h2 className="font-semibold">Configuration</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Name">
              <input className="input" value={cfg.name} onChange={(e) => setCfg({ ...cfg, name: e.target.value })} disabled={!canWrite} />
            </Field>
            <Field label="Priority">
              <input className="input" type="number" min={0} value={cfg.priority} onChange={(e) => setCfg({ ...cfg, priority: e.target.value })} disabled={!canWrite} />
            </Field>
            <Field label="Timeout (ms)">
              <input className="input" type="number" min={1000} value={cfg.timeoutMs} onChange={(e) => setCfg({ ...cfg, timeoutMs: e.target.value })} disabled={!canWrite} />
            </Field>
          </div>
          {isReal && (
            <>
              <Field label="Base URL (https only, from the supplier's documentation)">
                <input className="input" type="url" value={cfg.baseUrl} onChange={(e) => setCfg({ ...cfg, baseUrl: e.target.value })} disabled={!canWrite} />
              </Field>
              <Field label="Credentials env prefix" hint="Secrets are read from server env vars like PREFIX_API_KEY and are never stored here or sent to the browser.">
                <input className="input font-mono" value={cfg.credentialsEnvPrefix} onChange={(e) => setCfg({ ...cfg, credentialsEnvPrefix: e.target.value.toUpperCase() })} disabled={!canWrite} />
              </Field>
              <Field label="Authorization reference" hint="Contract / reseller agreement ID. Required to mark the supplier as authorized.">
                <input className="input" value={cfg.authorizationNote} onChange={(e) => setCfg({ ...cfg, authorizationNote: e.target.value })} disabled={!canWrite} />
              </Field>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={cfg.isAuthorized} onChange={(e) => setCfg({ ...cfg, isAuthorized: e.target.checked })} disabled={!canWrite} />
                <span>I confirm we hold commercial authorization from this supplier and have its official API documentation.</span>
              </label>
            </>
          )}
          {canWrite && (
            <button className="btn-primary" disabled={save.pending}>
              {save.pending && <Spinner />} Save configuration
            </button>
          )}
        </form>
      </div>

      <section className="card overflow-x-auto p-5">
        <h2 className="mb-3 font-semibold">Product mappings</h2>
        <ErrorBox message={mappings.error ?? mapAction.error} />
        <table className="table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Supplier SKU</th>
              <th className="text-right">Supplier cost</th>
              <th>Status</th>
              {canWrite && <th />}
            </tr>
          </thead>
          <tbody>
            {mappings.data?.mappings.map((m) => (
              <tr key={m.id}>
                <td>
                  {m.product.name} <span className="text-xs text-muted">· {m.product.game.name}</span>
                </td>
                <td className="font-mono text-xs">{m.providerSku}</td>
                <td className="text-right tabular-nums">{money(m.costMinor, m.currency)}</td>
                <td>
                  <StatusBadge status={m.isActive ? 'ACTIVE' : 'CANCELLED'} label={m.isActive ? 'Active' : 'Inactive'} />
                </td>
                {canWrite && (
                  <td className="whitespace-nowrap text-right">
                    <button
                      className="btn-ghost px-2 py-1 text-xs"
                      onClick={() =>
                        setMapForm({ productId: m.product.id, providerSku: m.providerSku, cost: minorToDecimalString(m.costMinor, m.currency), currency: m.currency })
                      }
                    >
                      Edit
                    </button>
                    <button
                      className="btn-ghost px-2 py-1 text-xs text-bad"
                      onClick={async () => {
                        const ok = await mapAction.run(() => api(`/admin/providers/${id}/products/${m.product.id}`, { method: 'DELETE' }));
                        if (ok) await mappings.reload();
                      }}
                    >
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {canWrite && (
          <form onSubmit={saveMapping} className="mt-4 grid gap-3 rounded-[8px] border border-border p-4 sm:grid-cols-5 sm:items-end">
            <div className="sm:col-span-2">
              <Field label="Product">
                <select className="input" required value={mapForm.productId} onChange={(e) => setMapForm({ ...mapForm, productId: e.target.value })}>
                  <option value="">Select…</option>
                  {products.data?.products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.game.name} — {p.name} ({p.sku})
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Supplier SKU">
              <input className="input" required value={mapForm.providerSku} onChange={(e) => setMapForm({ ...mapForm, providerSku: e.target.value })} />
            </Field>
            <Field label={`Cost (${mapForm.currency})`}>
              <input className="input" required inputMode="decimal" pattern="\d+(\.\d{1,2})?" value={mapForm.cost} onChange={(e) => setMapForm({ ...mapForm, cost: e.target.value })} />
            </Field>
            <button className="btn-primary" disabled={mapAction.pending}>
              Save mapping
            </button>
          </form>
        )}
      </section>

      <section className="card overflow-x-auto p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">API logs</h2>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={failedOnly}
              onChange={(e) => {
                setFailedOnly(e.target.checked);
                setLogPage(1);
              }}
            />
            Failures only
          </label>
        </div>
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
            {logs.data?.items.map((l) => (
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
                    <JsonView value={{ orderId: l.orderId, request: l.requestSummary, response: l.responseSummary, error: l.errorMessage }} />
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.data && <Pagination page={logs.data.page} totalPages={logs.data.totalPages} onPage={setLogPage} />}
      </section>
    </div>
  );
}
