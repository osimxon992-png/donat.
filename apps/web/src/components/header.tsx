'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Logo } from './logo';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';

export function Header() {
  const { user, loading, logout, can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const notifications = useApi<{ unread: number }>(user ? '/account/notifications' : null, 30_000);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  const navLink = (href: string, label: string, show = 'md:inline-block') => (
    <Link
      href={href}
      className={`hidden px-3 py-2 text-sm font-medium transition-colors ${show} ${
        pathname === href || (href !== '/' && pathname.startsWith(href)) ? 'text-text' : 'text-muted hover:text-text'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header className="sticky top-0 z-30 border-b border-ink/10 bg-bg/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-5">
        <div className="flex items-center gap-6">
          <Logo />
          <nav className="flex items-center">
            {navLink('/?c=games', 'Games')}
            {navLink('/?c=services', 'Apps')}
            {navLink('/?c=mobile', 'Mobile')}
            {navLink('/guides', 'ID guide', 'lg:inline-block')}
            {navLink('/account/orders', 'Track order', 'lg:inline-block')}
            {navLink('/help', 'Help', 'lg:inline-block')}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {loading ? null : user ? (
            <>
              <Link href="/account/notifications" className="relative grid h-10 w-10 place-items-center rounded-md text-muted hover:bg-surface-2/60 hover:text-text" aria-label="Notifications">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16ZM10 20.5a2 2 0 0 0 4 0" />
                </svg>
                {!!notifications.data?.unread && (
                  <span className="absolute top-1.5 right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 font-mono text-[10px] text-white">
                    {notifications.data.unread}
                  </span>
                )}
              </Link>
              <div className="relative" ref={menuRef}>
                <button
                  className="flex h-10 items-center gap-2 rounded-md border border-ink/15 bg-surface pr-3 pl-1.5 text-sm font-medium hover:border-ink"
                  onClick={() => setOpen((o) => !o)}
                  aria-expanded={open}
                  aria-haspopup="menu"
                >
                  <span className="grid h-7 w-7 place-items-center rounded bg-ink font-display text-xs font-bold text-paper">
                    {user.name[0]?.toUpperCase()}
                  </span>
                  <span className="hidden max-w-32 truncate sm:inline">{user.name.split(' ')[0]}</span>
                </button>
                {open && (
                  <div role="menu" className="absolute right-0 mt-2 w-56 overflow-hidden rounded-[10px] border border-ink/15 bg-surface py-1 shadow-[0_12px_32px_-12px_rgba(22,21,19,0.25)]">
                    <p className="truncate border-b border-border px-4 py-2.5 text-xs text-muted">{user.email}</p>
                    <MenuLink href="/account">Dashboard</MenuLink>
                    <MenuLink href="/account/orders">Orders</MenuLink>
                    <MenuLink href="/account/players">Saved player IDs</MenuLink>
                    <MenuLink href="/account/support">Support</MenuLink>
                    <MenuLink href="/account/settings">Settings</MenuLink>
                    {can('admin:access') && (
                      <div className="border-t border-border">
                        <MenuLink href="/admin">Admin panel →</MenuLink>
                      </div>
                    )}
                    <button
                      className="block w-full border-t border-border px-4 py-2.5 text-left text-sm text-muted hover:bg-surface-2/50 hover:text-bad"
                      onClick={async () => {
                        await logout();
                        router.push('/');
                      }}
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost">
                Sign in
              </Link>
              <Link href="/register" className="btn-primary">
                Create account
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} role="menuitem" className="block px-4 py-2 text-sm hover:bg-surface-2/50">
      {children}
    </Link>
  );
}
