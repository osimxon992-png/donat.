'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Logo } from './logo';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';

const NAV: [href: string, label: string][] = [
  ['/', 'Store'],
  ['/?c=games', 'Games'],
  ['/?c=services', 'Apps & wallets'],
  ['/?c=mobile', 'Mobile'],
  ['/guides', 'ID guide'],
  ['/help', 'Help'],
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b-[3px] border-ink bg-pop">
      <Suspense fallback={<div className="h-[68px]" />}>
        <HeaderInner />
      </Suspense>
    </header>
  );
}

function SearchBox({ className = '', autoFocus = false }: { className?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => setQ(params.get('q') ?? ''), [params]);

  // "/" focuses search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <form
      role="search"
      className={`flex h-11 items-center gap-2.5 rounded-full border-[2.5px] border-ink bg-white px-4 transition-shadow focus-within:shadow-comic-sm ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        router.push(q.trim() ? `/?q=${encodeURIComponent(q.trim())}` : '/');
        ref.current?.blur();
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-ink" aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        ref={ref}
        autoFocus={autoFocus}
        className="h-full w-full bg-transparent text-sm font-medium outline-none placeholder:text-muted"
        placeholder="Search games, apps, operators"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search the store"
      />
    </form>
  );
}

function HeaderInner() {
  const { user, loading, logout, can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const c = params.get('c');
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const notifications = useApi<{ unread: number }>(user ? '/account/notifications' : null, 30_000);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  useEffect(() => {
    setOpen(false);
    setMobileOpen(false);
  }, [pathname, params]);

  const isActive = (href: string) => {
    const [path, query] = href.split('?');
    if (path === '/' && pathname === '/') return query ? `c=${c}` === query : !c;
    return path !== '/' && (pathname === path || pathname.startsWith(`${path}/`));
  };

  return (
    <>
      <div className="mx-auto flex h-[68px] max-w-[1400px] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Logo />
        <nav className="ml-4 hidden items-center gap-1 xl:flex">
          {NAV.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className={`relative rounded-md px-3 py-1 font-display text-xl tracking-wider uppercase transition-transform hover:-rotate-2 ${isActive(href) ? 'bg-ink text-pop' : 'text-ink hover:bg-white/60'}`}
            >
              {label}
            </Link>
          ))}
        </nav>

        <SearchBox className="ml-auto hidden w-full max-w-xs md:flex" />

        <div className="ml-auto flex items-center gap-1.5 md:ml-0">
          {loading ? null : user ? (
            <>
              <Link
                href="/account/notifications"
                className="relative grid h-11 w-11 place-items-center rounded-full text-ink hover:bg-white/60"
                aria-label="Notifications"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16ZM10 20.5a2 2 0 0 0 4 0" />
                </svg>
                {!!notifications.data?.unread && (
                  <span className="absolute top-1 right-1 grid h-5 min-w-5 place-items-center rounded-full border-2 border-ink bg-accent px-1 text-[10px] font-bold text-white">
                    {notifications.data.unread}
                  </span>
                )}
              </Link>
              <div className="relative" ref={menuRef}>
                <button
                  className="grid h-11 w-11 place-items-center rounded-full border-[3px] border-ink bg-cyan font-display text-xl text-white shadow-comic-sm transition hover:-rotate-6"
                  onClick={() => setOpen((o) => !o)}
                  aria-expanded={open}
                  aria-haspopup="menu"
                  aria-label="Account menu"
                >
                  {user.name[0]?.toUpperCase()}
                </button>
                {open && (
                  <div role="menu" className="card absolute right-0 mt-3 w-64 overflow-hidden p-1.5">
                    <div className="px-3 py-2.5">
                      <p className="truncate font-display text-xl tracking-wide">{user.name}</p>
                      <p className="truncate text-xs text-muted">{user.email}</p>
                    </div>
                    <div className="my-1 border-t-2 border-ink" />
                    <MenuLink href="/account">Dashboard</MenuLink>
                    <MenuLink href="/account/orders">My orders</MenuLink>
                    <MenuLink href="/account/players">Saved player IDs</MenuLink>
                    <MenuLink href="/account/support">Support</MenuLink>
                    <MenuLink href="/account/settings">Settings</MenuLink>
                    {can('admin:access') && <MenuLink href="/admin">Admin panel</MenuLink>}
                    <div className="my-1 border-t-2 border-ink" />
                    <button
                      className="block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-muted hover:bg-accent hover:text-white"
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
              <Link href="/login" className="btn-ghost hidden sm:inline-flex">
                Sign in
              </Link>
              <Link href="/register" className="btn-accent h-10 px-4">
                Sign up
              </Link>
            </>
          )}
          <button
            className="grid h-11 w-11 place-items-center rounded-lg border-[2.5px] border-ink bg-white text-ink xl:hidden"
            onClick={() => setMobileOpen((o) => !o)}
            aria-expanded={mobileOpen}
            aria-label="Menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {mobileOpen ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t-[3px] border-ink bg-pop px-4 pt-3 pb-4 xl:hidden">
          <SearchBox className="mb-3 md:hidden" />
          <nav className="grid gap-1 sm:grid-cols-2">
            {NAV.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className={`rounded-lg px-3 py-2 font-display text-xl tracking-wider uppercase ${isActive(href) ? 'bg-ink text-pop' : 'text-ink hover:bg-white/60'}`}
              >
                {label}
              </Link>
            ))}
            {!user && (
              <Link href="/login" className="rounded-lg px-3 py-2 font-display text-xl tracking-wider text-ink uppercase sm:hidden">
                Sign in
              </Link>
            )}
          </nav>
        </div>
      )}
    </>
  );
}

function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} role="menuitem" className="block rounded-lg px-3 py-2 text-sm font-semibold hover:bg-pop">
      {children}
    </Link>
  );
}
