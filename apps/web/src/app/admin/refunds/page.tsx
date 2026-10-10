'use client';

import Link from 'next/link';
import { useState } from 'react';
import { EmptyState, ErrorBox, Loading, PageHeader, Pagination, StatusBadge } from '@/components/ui';
import { dateTime, money } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { Paged } from '@/lib/types';

interface RefundRow {
  id: string;
  orderId: string;
  amountMinor: number;
  currency: string;
  reason: string;
  status: string;
  failureReason: string | null;
  createdAt: string;
  processedAt: string | null;
  order: { orderNumber: string };
  requestedBy: { email: string } | null;
}

export default function RefundsPage() {
  const [page, setPage] = useState(1);
  const { data, error, loading } = useApi<Paged<RefundRow>>(`/admin/refunds?page=${page}&pageSize=30`);

  return (
    <div>
      <PageHeader title="Refunds" subtitle="Refunds are started from an order page. Automatic refunds cover late or duplicate payments." />
      <ErrorBox message={error} />
      {loading && !data ? (
        <Loading />
      ) : !data?.items.length ? (
        <EmptyState title="No refunds" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Created</th>
                <th>Order</th>
                <th>Reason</th>
                <th>Requested by</th>
                <th className="text-right">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{dateTime(r.createdAt)}</td>
                  <td>
                    <Link href={`/admin/orders/${r.orderId}`} className="link">
                      {r.order.orderNumber}
                    </Link>
                  </td>
                  <td>
                    {r.reason}
                    {r.failureReason && <p className="text-xs text-bad">{r.failureReason}</p>}
                  </td>
                  <td className="text-muted">{r.requestedBy?.email ?? 'system'}</td>
                  <td className="text-right tabular-nums">{money(r.amountMinor, r.currency)}</td>
                  <td>
                    <StatusBadge status={r.status} />
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
