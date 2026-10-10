'use client';

import { useState } from 'react';
import { JsonView } from '@/components/json-view';
import { EmptyState, ErrorBox, Loading, PageHeader, Pagination, StatusBadge } from '@/components/ui';
import { dateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { Paged } from '@/lib/types';

interface WebhookRow {
  id: string;
  provider: string;
  eventId: string;
  eventType: string;
  signatureValid: boolean;
  status: string;
  payload: unknown;
  error: string | null;
  receivedAt: string;
  processedAt: string | null;
}

export default function WebhooksPage() {
  const [page, setPage] = useState(1);
  const { data, error, loading } = useApi<Paged<WebhookRow>>(`/admin/webhook-events?page=${page}&pageSize=30`, 15_000);

  return (
    <div>
      <PageHeader
        title="Payment webhook events"
        subtitle="Every verified gateway event is stored once (provider + event ID). Duplicates and replays are ignored; invalid signatures are rejected and audit-logged."
      />
      <ErrorBox message={error} />
      {loading && !data ? (
        <Loading />
      ) : !data?.items.length ? (
        <EmptyState title="No webhook events yet" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Received</th>
                <th>Provider</th>
                <th>Event</th>
                <th>Status</th>
                <th>Note</th>
                <th>Payload</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((w) => (
                <tr key={w.id}>
                  <td className="whitespace-nowrap">{dateTime(w.receivedAt)}</td>
                  <td>{w.provider}</td>
                  <td>
                    <p className="font-mono text-xs">{w.eventType}</p>
                    <p className="font-mono text-xs text-muted">{w.eventId}</p>
                  </td>
                  <td>
                    <StatusBadge status={w.status} />
                  </td>
                  <td className="text-xs text-muted">{w.error ?? '—'}</td>
                  <td>
                    <details>
                      <summary className="cursor-pointer text-xs text-muted">View</summary>
                      <JsonView value={w.payload} />
                    </details>
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
