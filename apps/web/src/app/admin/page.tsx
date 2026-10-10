'use client';

import { ORDER_STATUS_LABELS, type OrderStatus } from '@donat/shared';
import Link from 'next/link';
import { BarChart } from '@/components/bar-chart';
import { ErrorBox, Loading, PageHeader, Stat, StatusBadge } from '@/components/ui';
import { money } from '@/lib/format';
import { useApi } from '@/lib/hooks';

interface Overview {
  overview: {
    currency: string;
    totalOrders: number;
    completedOrders: number;
    pendingOrders: number;
    failedOrders: number;
    manualReviewOrders: number;
    refundedOrders: number;
    totalRevenueMinor: number;
    grossProfitMinor: number;
    refundedMinor: number;
    byStatus: Record<string, number>;
    providers: { code: string; name: string; health: string; isEnabled: boolean; balanceMinor: number | null; balanceCurrency: string | null }[];
  };
  daily: { bucket: string; orders: number; revenueMinor: number; profitMinor: number }[];
  monthly: { bucket: string; orders: number; revenueMinor: number; profitMinor: number }[];
}

export default function AdminOverview() {
  const { data, error, loading } = useApi<Overview>('/admin/overview', 30_000);
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error} />;
  const o = data.overview;
  const cur = o.currency;
  const series = (rows: Overview['daily'], fmt: (b: string) => string) =>
    rows.map((r) => ({
      label: fmt(r.bucket),
      value: r.revenueMinor,
      display: money(r.revenueMinor, cur),
      extra: `${r.orders} orders · profit ${money(r.profitMinor, cur)}`,
    }));

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" subtitle="Revenue and profit count delivered (FULFILLED) orders only." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total revenue" value={money(o.totalRevenueMinor, cur)} />
        <Stat label="Gross profit" value={money(o.grossProfitMinor, cur)} tone="ok" />
        <Stat label="Total orders" value={o.totalOrders} />
        <Stat label="Completed" value={o.completedOrders} />
        <Stat label="Pending" value={o.pendingOrders} hint="Unpaid, queued or delivering" />
        <Stat label="Failed" value={o.failedOrders} tone={o.failedOrders ? 'bad' : undefined} hint={<Link className="underline" href="/admin/orders?status=FAILED">Review</Link>} />
        <Stat label="Manual review" value={o.manualReviewOrders} tone={o.manualReviewOrders ? 'warn' : undefined} hint={<Link className="underline" href="/admin/orders?status=MANUAL_REVIEW">Review</Link>} />
        <Stat label="Refunded" value={money(o.refundedMinor, cur)} hint={`${o.refundedOrders} orders`} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <BarChart title="Daily revenue — last 30 days" data={series(data.daily, (b) => b.slice(5))} />
        <BarChart title="Monthly revenue — last 12 months" data={series(data.monthly, (b) => b)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">Orders by status</h2>
          <ul className="space-y-2 text-sm">
            {Object.entries(o.byStatus)
              .sort((a, b) => b[1] - a[1])
              .map(([status, count]) => (
                <li key={status} className="flex items-center justify-between">
                  <Link href={`/admin/orders?status=${status}`}>
                    <StatusBadge status={status} label={ORDER_STATUS_LABELS[status as OrderStatus]} />
                  </Link>
                  <span className="tabular-nums">{count}</span>
                </li>
              ))}
            {Object.keys(o.byStatus).length === 0 && <li className="text-muted">No orders yet.</li>}
          </ul>
        </div>
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">Providers</h2>
          <ul className="space-y-2 text-sm">
            {o.providers.map((p) => (
              <li key={p.code} className="flex items-center justify-between gap-3">
                <span className="truncate">{p.name}</span>
                <span className="flex items-center gap-2">
                  <span className="text-muted tabular-nums">{p.balanceMinor !== null ? money(p.balanceMinor, p.balanceCurrency) : '—'}</span>
                  <StatusBadge status={p.isEnabled ? p.health : 'CANCELLED'} label={p.isEnabled ? undefined : 'Disabled'} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
