'use client';

import Link from 'next/link';
import { useState } from 'react';
import { EmptyState, ErrorBox, Loading, PageHeader, Pagination, StatusBadge } from '@/components/ui';
import { dateTime, money } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { Paged } from '@/lib/types';

interface PaymentRow {
  id: string;
  provider: string;
  status: string;
  amountMinor: number;
  currency: string;
  createdAt: string;
  paidAt: string | null;
  order: { id: string; orderNumber: string };
  refunds: { status: string; amountMinor: number }[];
}

export default function PaymentsPage() {
  const [page, setPage] = useState(1);
  const { data, error, loading } = useApi<Paged<PaymentRow>>(`/payments?page=${page}&pageSize=20`);

  return (
    <div>
      <PageHeader title="Payment history" />
      <ErrorBox message={error} />
      {loading && !data ? (
        <Loading />
      ) : !data?.items.length ? (
        <EmptyState title="No payments yet" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Order</th>
                <th>Method</th>
                <th className="text-right">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap">{dateTime(p.createdAt)}</td>
                  <td>
                    <Link href={`/orders/${p.order.id}`} className="link">
                      {p.order.orderNumber}
                    </Link>
                  </td>
                  <td className="capitalize">{p.provider}</td>
                  <td className="text-right tabular-nums">{money(p.amountMinor, p.currency)}</td>
                  <td>
                    <StatusBadge status={p.status} />
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
