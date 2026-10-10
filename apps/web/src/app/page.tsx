'use client';

import { CATALOG_CATEGORIES, CATEGORY_LABELS, isCatalogCategory, type CatalogCategory } from '@donat/shared';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { CatalogGrid } from '@/components/catalog-card';
import { Faq } from '@/components/faq';
import { OperatorFinder } from '@/components/operator-finder';
import { EmptyState, ErrorBox, Loading } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import type { GameSummary } from '@/lib/types';

export default function HomePage() {
  // useSearchParams needs a Suspense boundary so the page can still be prerendered.
  return (
    <Suspense fallback={<Loading />}>
      <Home />
    </Suspense>
  );
}

function matches(g: GameSummary, q: string) {
  const needle = q.toLowerCase().trim();
  return !needle || g.name.toLowerCase().includes(needle) || g.currencyName.toLowerCase().includes(needle);
}

function Home() {
  const [q, setQ] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const c = useSearchParams().get('c');
  const category: CatalogCategory | null = isCatalogCategory(c) ? c : null;
  const all = useApi<{ games: GameSummary[] }>('/catalog/games');
  const catalog = all.data?.games ?? [];
  const items = catalog.filter((g) => (!category || g.category === category) && matches(g, q));
  const count = (cat: CatalogCategory | null) => catalog.filter((g) => !cat || g.category === cat).length;
  const operators = catalog.filter((g) => g.category === 'mobile');
  // With no tab and no search, every section gets its own heading.
  const grouped = !category && !q;

  const selectCategory = (next: CatalogCategory | null) => {
    router.replace(next ? `${pathname}?c=${next}` : pathname, { scroll: false });
  };

  // "/" focuses search, like on most stores people use daily.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="space-y-24">
      {/* Hero */}
      <section className="grid items-end gap-12 pt-4 md:grid-cols-[1.35fr_1fr]">
        <div>
          <p className="eyebrow mb-6">Games · Apps · Phone balance</p>
          <h1 className="text-[44px] leading-[0.95] font-extrabold tracking-[-0.045em] sm:text-6xl lg:text-[76px]">
            Top up anything,
            <br />
            in about
            <br />
            <span className="relative whitespace-nowrap text-accent">a minute.</span>
          </h1>
          <p className="mt-6 max-w-md text-[17px] leading-relaxed text-muted">
            Game currency, Telegram Premium and Stars, Steam and PlayStation wallets, and balance for any Uzbek phone number. We check the
            account before you pay, then you watch the top-up arrive.
          </p>
          <div className="mt-8 max-w-md">
            <div className="flex h-12 items-center gap-3 rounded-md border border-ink/25 bg-surface px-4 focus-within:border-ink">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-muted">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                ref={searchRef}
                className="h-full w-full bg-transparent text-[15px] outline-none placeholder:text-muted/80"
                placeholder="Find a game, app or operator"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Search the store"
              />
              <kbd className="rounded border border-ink/20 px-1.5 font-mono text-[11px] text-muted">/</kbd>
            </div>
          </div>
        </div>

        <aside className="relative hidden md:block">
          <div className="rotate-[1.2deg] bg-surface px-6 pt-6 pb-4 shadow-[0_1px_0_rgba(22,21,19,0.08),0_18px_40px_-24px_rgba(22,21,19,0.45)]">
            <div className="flex items-baseline justify-between font-mono text-[11px] tracking-wide text-muted uppercase">
              <span>How an order works</span>
              <span>No. 0001</span>
            </div>
            <div className="rule-dashed my-4" />
            <ul className="space-y-3 font-mono text-[13px]">
              {[
                ['01', 'Pick a package', '30 sec'],
                ['02', 'Paste your ID or number', 'we check it'],
                ['03', 'Pay', 'card / wallet'],
                ['04', 'Delivered to your account', '≈ 1 min'],
              ].map(([n, step, note]) => (
                <li key={n} className="flex items-baseline gap-3">
                  <span className="text-muted">{n}</span>
                  <span className="shrink-0">{step}</span>
                  <span className="mx-1 flex-1 translate-y-[-3px] border-b border-dotted border-ink/30" />
                  <span className="shrink-0 text-muted">{note}</span>
                </li>
              ))}
            </ul>
            <div className="rule-dashed my-4" />
            <div className="flex items-baseline justify-between font-mono text-[13px]">
              <span>Charged twice</span>
              <span className="font-semibold">never</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between font-mono text-[13px]">
              <span>Failed delivery</span>
              <span className="font-semibold">refunded</span>
            </div>
            <p className="mt-6 text-center font-mono text-[10px] tracking-[0.2em] text-muted uppercase">Thank you — keep playing</p>
          </div>
          <div className="receipt-edge rotate-[1.2deg]" />
        </aside>
      </section>

      {/* Catalogue */}
      <section id="catalogue" className="scroll-mt-24">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-ink/10 pb-4">
          <div role="tablist" aria-label="Store sections" className="flex flex-wrap gap-2">
            {([null, ...CATALOG_CATEGORIES] as const).map((cat) => {
              const active = cat === category;
              return (
                <button
                  key={cat ?? 'all'}
                  role="tab"
                  aria-selected={active}
                  onClick={() => selectCategory(cat)}
                  className={`flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors ${
                    active ? 'border-ink bg-ink text-paper' : 'border-ink/20 bg-surface text-muted hover:border-ink hover:text-text'
                  }`}
                >
                  {cat ? CATEGORY_LABELS[cat].title : 'Everything'}
                  <span className={`font-mono text-[11px] ${active ? 'text-paper/60' : 'text-muted/80'}`}>{String(count(cat)).padStart(2, '0')}</span>
                </button>
              );
            })}
          </div>
          {q && (
            <button className="text-sm text-muted hover:text-text" onClick={() => setQ('')}>
              Clear search ×
            </button>
          )}
        </div>
        <ErrorBox message={all.error} />
        {all.loading && !all.data ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState title={q ? `Nothing called “${q}” yet` : 'Nothing here yet'}>
            {q ? 'Try the publisher’s name, the currency (e.g. “Stars”) or a shorter word.' : 'Check back soon.'}
          </EmptyState>
        ) : grouped ? (
          <div className="space-y-16">
            {CATALOG_CATEGORIES.map((cat) => {
              const section = items.filter((g) => g.category === cat);
              if (!section.length) return null;
              return (
                <div key={cat}>
                  <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <h2 className="text-2xl font-bold">{CATEGORY_LABELS[cat].title}</h2>
                      <p className="mt-1 text-sm text-muted">{CATEGORY_LABELS[cat].blurb}</p>
                    </div>
                    <button className="link text-sm" onClick={() => selectCategory(cat)}>
                      Only {CATEGORY_LABELS[cat].short.toLowerCase()} →
                    </button>
                  </div>
                  <CatalogGrid items={section} />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-10">
            {category === 'mobile' && operators.length > 0 && (
              <div className="max-w-md">
                <OperatorFinder operators={operators} />
              </div>
            )}
            <CatalogGrid items={items} />
          </div>
        )}
      </section>

      {/* Tools */}
      <section className="grid gap-5 md:grid-cols-3">
        <div>
          <p className="eyebrow mb-3">Handy, even if you don’t buy</p>
          <h2 className="text-3xl leading-tight font-bold">Small tools that save a support ticket.</h2>
          <p className="mt-3 text-sm text-muted">Most failed top-ups come from a wrong ID or the wrong operator. These help you get it right the first time.</p>
        </div>
        {operators.length > 0 && <OperatorFinder operators={operators} />}
        <Link href="/guides" className="card group flex flex-col justify-between p-5 transition-colors hover:border-ink">
          <div>
            <p className="eyebrow">Where is my ID?</p>
            <p className="mt-1 text-sm text-muted">
              One page that shows where every game and app keeps your player ID, UID, tag or username — and what it should look like.
            </p>
          </div>
          <span className="mt-6 font-semibold">
            Open the ID guide <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
          </span>
        </Link>
      </section>

      {/* Promises */}
      <section className="grid border-y border-ink/10 md:grid-cols-3 md:divide-x md:divide-ink/10">
        {[
          ['We check the account first', 'Before you pay we ask the supplier whether the ID, username or number exists. A typo never costs you money.'],
          ['Watch it arrive', 'Your order page updates on its own — paid, queued, delivering, delivered. No refreshing, no guessing.'],
          ['If it fails, it’s refunded', 'A failed top-up goes to a person on our team, not a bot. If it can’t be delivered, the money goes back to your card.'],
        ].map(([title, body], i) => (
          <div key={title} className="py-8 md:px-8 md:first:pl-0 md:last:pr-0">
            <p className="font-mono text-xs text-accent">0{i + 1}</p>
            <h3 className="mt-3 text-xl font-bold">{title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">{body}</p>
          </div>
        ))}
      </section>

      {/* FAQ */}
      <section className="grid gap-10 md:grid-cols-[1fr_2fr]">
        <div>
          <p className="eyebrow mb-3">FAQ</p>
          <h2 className="text-3xl leading-tight font-bold">Before you buy</h2>
          <Link href="/help" className="link mt-4 inline-block text-sm">
            All questions
          </Link>
        </div>
        <Faq limit={4} />
      </section>
    </div>
  );
}
