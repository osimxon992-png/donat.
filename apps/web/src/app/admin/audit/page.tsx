'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { JsonView } from '@/components/json-view';
import { EmptyState, ErrorBox, Loading, PageHeader, Pagination } from '@/components/ui';
import { dateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { Paged } from '@/lib/types';

interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  ip: string | null;
  createdAt: string;
  actor: { email: string } | null;
}

function AuditInner() {
  const params = useSearchParams();
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);
  const actorId = params.get('actorId') ?? '';
  const q = new URLSearchParams({ page: String(page), pageSize: '50' });
  if (action) q.set('action', action);
  if (entityType) q.set('entityType', entityType);
  if (actorId) q.set('actorId', actorId);
  const { data, error, loading } = useApi<Paged<AuditRow>>(`/admin/audit-logs?${q.toString()}`);

  return (
    <div>
      <PageHeader title="Audit log" subtitle="Security-relevant and administrative actions. Secrets are redacted." />
      <div className="mb-4 flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Action contains… (e.g. order.)" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} />
        <select className="input w-48" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }}>
          <option value="">All entities</option>
          {['User', 'Order', 'Payment', 'Game', 'Product', 'Promotion', 'TopUpProvider', 'ProviderProduct', 'Role', 'Session', 'SupportTicket', 'WebhookEvent'].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <ErrorBox message={error} />
      {loading && !data ? (
        <Loading />
      ) : !data?.items.length ? (
        <EmptyState title="No audit entries" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>IP</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap">{dateTime(a.createdAt)}</td>
                  <td className="max-w-40 truncate">{a.actor?.email ?? 'system'}</td>
                  <td className="font-mono text-xs">{a.action}</td>
                  <td className="text-xs">
                    {a.entityType}
                    {a.entityId && <p className="font-mono text-muted">{a.entityId}</p>}
                  </td>
                  <td className="font-mono text-xs text-muted">{a.ip ?? '—'}</td>
                  <td>
                    {a.metadata ? (
                      <details>
                        <summary className="cursor-pointer text-xs text-muted">View</summary>
                        <JsonView value={a.metadata} />
                      </details>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />}
    </div>
  );
}

export default function AuditPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AuditInner />
    </Suspense>
  );
}
