'use client';

import type { ReactNode } from 'react';
import { SideNav } from '@/components/side-nav';
import { Loading } from '@/components/ui';
import { useRequireAuth } from '@/lib/auth';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { allowed, can } = useRequireAuth('admin:access');
  if (!allowed) return <Loading />;
  const nav = [
    { href: '/admin', label: 'Overview', show: can('dashboard:read') },
    { href: '/admin/orders', label: 'Orders', show: can('orders:read') },
    { href: '/admin/refunds', label: 'Refunds', show: can('orders:read') },
    { href: '/admin/games', label: 'Games & packages' },
    { href: '/admin/pricing', label: 'Pricing' },
    { href: '/admin/promotions', label: 'Promotions' },
    { href: '/admin/providers', label: 'Providers', show: can('providers:read') },
    { href: '/admin/users', label: 'Users', show: can('users:read') },
    { href: '/admin/roles', label: 'Roles', show: can('users:read') },
    { href: '/admin/support', label: 'Support tickets', show: can('support:manage') },
    { href: '/admin/webhooks', label: 'Webhook events', show: can('webhooks:read') },
    { href: '/admin/audit', label: 'Audit log', show: can('audit:read') },
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
      <SideNav title="Admin" items={nav} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
