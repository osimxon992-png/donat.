'use client';

import Link from 'next/link';
import { useState } from 'react';
import { EmptyState, ErrorBox, Loading, PageHeader, Pagination, StatusBadge } from '@/components/ui';
import { relative } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { Paged } from '@/lib/types';

interface TicketRow {
  id: string;
  subject: string;
  status: string;
  priority: string;
  updatedAt: string;
  user: { email: string; name: string };
  order: { orderNumber: string } | null;
}

const STATUSES = ['OPEN', 'AWAITING_SUPPORT', 'AWAITING_CUSTOMER', 'RESOLVED', 'CLOSED'];

export default function AdminSupportPage() {
  const [status, setStatus] = useState('AWAITING_SUPPORT');
  const [page, setPage] = useState(1);
  const { data, error, loading } = useApi<Paged<TicketRow>>(`/admin/tickets?page=${page}&pageSize=30${status ? `&status=${status}` : ''}`, 30_000);

  return (
    <div>
      <PageHeader
        title="Support tickets"
        actions={
          <select
            className="input w-56"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replaceAll('_', ' ').toLowerCase()}
              </option>
            ))}
          </select>
        }
      />
      <ErrorBox message={error} />
      {loading && !data ? (
        <Loading />
      ) : !data?.items.length ? (
        <EmptyState title="No tickets in this view" />
      ) : (
        <ul className="space-y-2">
          {data.items.map((t) => (
            <li key={t.id}>
              <Link href={`/admin/support/${t.id}`} className="card flex items-center justify-between gap-3 p-4 hover:border-muted">
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.subject}</p>
                  <p className="truncate text-xs text-muted">
                    {t.user.name} ({t.user.email}){t.order ? ` · ${t.order.orderNumber}` : ''} · {relative(t.updatedAt)}
                  </p>
                </div>
                <StatusBadge status={t.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />}
    </div>
  );
}
