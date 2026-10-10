'use client';

import { ORDER_STATUSES, ORDER_STATUS_LABELS } from '@donat/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { EmptyState, ErrorBox, Loading, PageHeader, Pagination, StatusBadge } from '@/components/ui';
import { dateTime, money } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { Paged } from '@/lib/types';

interface Row {
  id: string;
  orderNumber: string;
  status: string;
  statusLabel: string;
  userEmail: string;
  gameName: string;
  productName?: string;
  playerId: string;
  totalMinor: number;
  costMinor: number;
  currency: string;
  paymentStatus: string | null;
  createdAt: string;
}

function OrdersInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [debounced, setDebounced] = useState(q);
  const status = params.get('status') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const page = Number(params.get('page') ?? '1');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    router.replace(`/admin/orders?${next.toString()}`);
  };

  const query = new URLSearchParams({ page: String(page), pageSize: '25' });
  if (debounced) query.set('q', debounced);
  if (status) query.set('status', status);
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  const { data, error, loading } = useApi<Paged<Row>>(`/admin/orders?${query.toString()}`, 15_000);

  return (
    <div>
      <PageHeader title="Orders" subtitle={data ? `${data.total} orders` : undefined} />
      <div className="mb-4 flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Order #, email or player ID" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-48" value={status} onChange={(e) => setParam('status', e.target.value)}>
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <input className="input w-40" type="date" value={from} onChange={(e) => setParam('from', e.target.value)} aria-label="From date" />
        <input className="input w-40" type="date" value={to} onChange={(e) => setParam('to', e.target.value)} aria-label="To date" />
      </div>
      <ErrorBox message={error} />
      {loading && !data ? (
        <Loading />
      ) : !data?.items.length ? (
        <EmptyState title="No orders match these filters" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Product</th>
                <th>Player</th>
                <th className="text-right">Total</th>
                <th className="text-right">Profit</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((o) => (
                <tr key={o.id} className="cursor-pointer" onClick={() => router.push(`/admin/orders/${o.id}`)}>
                  <td>
                    <Link href={`/admin/orders/${o.id}`} className="link font-medium">
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td className="max-w-40 truncate">{o.userEmail}</td>
                  <td className="whitespace-nowrap">
                    {o.productName} <span className="text-muted">· {o.gameName}</span>
                  </td>
                  <td className="font-mono text-xs">{o.playerId}</td>
                  <td className="text-right tabular-nums">{money(o.totalMinor, o.currency)}</td>
                  <td className="text-right tabular-nums text-muted">{money(o.totalMinor - o.costMinor, o.currency)}</td>
                  <td>{o.paymentStatus ? <StatusBadge status={o.paymentStatus} /> : '—'}</td>
                  <td>
                    <StatusBadge status={o.status} label={o.statusLabel} />
                  </td>
                  <td className="whitespace-nowrap text-muted">{dateTime(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} onPage={(p) => setParam('page', String(p))} />}
    </div>
  );
}

export default function AdminOrdersPage() {
  return (
    <Suspense fallback={<Loading />}>
      <OrdersInner />
    </Suspense>
  );
}
