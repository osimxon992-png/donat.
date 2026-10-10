'use client';

import Link from 'next/link';
import { OrderList } from '@/components/order-list';
import { EmptyState, ErrorBox, Loading, PageHeader, Stat } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { date, money } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { CustomerOrder, Paged, User } from '@/lib/types';

export default function AccountOverview() {
  const { user } = useAuth();
  const profile = useApi<{ user: User; stats: { orders: number; spentMinor: number } }>('/account/profile');
  const orders = useApi<Paged<CustomerOrder>>('/orders?pageSize=5');
  const active = orders.data?.items.filter((o) => ['PAID', 'QUEUED', 'PROCESSING', 'AWAITING_PAYMENT', 'MANUAL_REVIEW'].includes(o.status));
  const currency = orders.data?.items[0]?.currency ?? 'USD';

  return (
    <div className="space-y-6">
      <PageHeader title={`Hi, ${user?.name ?? ''}`} subtitle={`Member since ${date(user?.createdAt)}`} actions={<Link href="/" className="btn-primary">New top-up</Link>} />
      <ErrorBox message={profile.error ?? orders.error} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Orders" value={profile.data?.stats.orders ?? '—'} />
        <Stat label="Total spent" value={profile.data ? money(profile.data.stats.spentMinor, currency) : '—'} />
        <Stat label="In progress" value={active?.length ?? '—'} tone={active?.length ? 'warn' : undefined} />
      </div>
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Recent orders</h2>
          <Link href="/account/orders" className="link text-sm">
            View all
          </Link>
        </div>
        {orders.loading && !orders.data ? (
          <Loading />
        ) : orders.data?.items.length ? (
          <OrderList orders={orders.data.items} />
        ) : (
          <EmptyState title="No orders yet">
            <Link href="/" className="link">
              Browse games
            </Link>
          </EmptyState>
        )}
      </section>
    </div>
  );
}
