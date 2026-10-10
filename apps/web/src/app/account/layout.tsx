'use client';

import type { ReactNode } from 'react';
import { SideNav } from '@/components/side-nav';
import { Loading } from '@/components/ui';
import { useRequireAuth } from '@/lib/auth';

const NAV = [
  { href: '/account', label: 'Overview' },
  { href: '/account/orders', label: 'Orders' },
  { href: '/account/payments', label: 'Payments' },
  { href: '/account/players', label: 'Saved players' },
  { href: '/account/support', label: 'Support' },
  { href: '/account/notifications', label: 'Notifications' },
  { href: '/account/settings', label: 'Settings' },
];

export default function AccountLayout({ children }: { children: ReactNode }) {
  const { allowed } = useRequireAuth();
  if (!allowed) return <Loading />;
  return (
    <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
      <SideNav title="My account" items={NAV} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
