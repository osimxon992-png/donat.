'use client';

import { CATALOG_CATEGORIES, CATEGORY_LABELS, isCatalogCategory, type CatalogCategory } from '@donat/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { Faq } from '@/components/faq';
import { OperatorFinder } from '@/components/operator-finder';
import { Burst, HeroSlider, SectionTitle, Shelf, StoreCard } from '@/components/store';
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

const CATEGORY_STYLE: Record<CatalogCategory, { bg: string; word: string; icon: ReactNode }> = {
  games: {
    bg: 'bg-accent text-white',
    word: 'BOOM!',
    icon: <path d="M7 9v4M5 11h4M15 10h.01M18 12h.01M6.5 6h11A3.5 3.5 0 0 1 21 9.5v5a3.5 3.5 0 0 1-6.3 2.1L14 16h-4l-.7.6A3.5 3.5 0 0 1 3 14.5v-5A3.5 3.5 0 0 1 6.5 6Z" />,
  },
  services: {
    bg: 'bg-cyan text-ink',
    word: 'ZAP!',
    icon: <path d="M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7ZM16 12h.01M4 9h16" />,
  },
  mobile: {
    bg: 'bg-magenta text-white',
    word: 'RING!',
    icon: <path d="M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM11 18h2" />,
  },
};

function Icon({ children, size = 22 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

function Home() {
  const router = useRouter();
  const params = useSearchParams();
  const c = params.get('c');
  const q = params.get('q') ?? '';
  const category: CatalogCategory | null = isCatalogCategory(c) ? c : null;
  const all = useApi<{ games: GameSummary[] }>('/catalog/games');
  const catalog = all.data?.games ?? [];
  const byCat = (cat: CatalogCategory) => catalog.filter((g) => g.category === cat);
  const operators = byCat('mobile');

  if (all.loading && !all.data) return <Loading />;
  if (all.error) return <ErrorBox message={all.error} />;

  // Filtered view: a category tab or a search from the header.
  if (category || q) {
    const items = catalog.filter((g) => (!category || g.category === category) && matches(g, q));
    const setCategory = (next: CatalogCategory | null) => {
      const sp = new URLSearchParams();
      if (next) sp.set('c', next);
      if (q) sp.set('q', q);
      router.replace(sp.size ? `/?${sp}` : '/', { scroll: false });
    };
    return (
      <div className="space-y-8">
        <SectionTitle sub={category ? CATEGORY_LABELS[category].blurb : undefined}>
          {q ? `Results for “${q}”` : CATEGORY_LABELS[category!].title}
        </SectionTitle>
        <div role="tablist" aria-label="Store sections" className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pt-1 pb-3 sm:mx-0 sm:px-0">
          {([null, ...CATALOG_CATEGORIES] as const).map((cat) => {
            const active = cat === category;
            return (
              <button
                key={cat ?? 'all'}
                role="tab"
                aria-selected={active}
                onClick={() => setCategory(cat)}
                className={`btn h-10 shrink-0 px-4 text-base ${active ? 'bg-ink text-pop' : 'bg-white text-ink'}`}
              >
                {cat ? CATEGORY_LABELS[cat].title : 'Everything'}
              </button>
            );
          })}
          {q && (
            <Link href={category ? `/?c=${category}` : '/'} className="btn h-10 shrink-0 bg-white px-4 text-base text-accent">
              Clear search ✕
            </Link>
          )}
        </div>
        {category === 'mobile' && operators.length > 0 && (
          <div className="max-w-md">
            <OperatorFinder operators={operators} />
          </div>
        )}
        {items.length === 0 ? (
          <EmptyState title={q ? `Nothing found for “${q}”` : 'Nothing here yet'}>
            {q ? 'Try the publisher’s name, the currency (e.g. “Stars”) or a shorter word.' : 'Check back soon.'}
          </EmptyState>
        ) : (
          <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {items.map((g) => (
              <StoreCard key={g.id} game={g} fluid />
            ))}
          </div>
        )}
      </div>
    );
  }

  const featured = [...byCat('games').slice(0, 3), ...byCat('services').slice(0, 1), ...byCat('mobile').slice(0, 1)];

  return (
    <div className="space-y-16 sm:space-y-20">
      <HeroSlider games={featured} />

      {/* Category panels */}
      <section className="grid gap-5 sm:grid-cols-3">
        {CATALOG_CATEGORIES.map((cat, i) => {
          const style = CATEGORY_STYLE[cat];
          return (
            <Link
              key={cat}
              href={`/?c=${cat}`}
              className={`panel group relative flex min-h-[150px] flex-col justify-between overflow-hidden p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-comic-lg ${style.bg} ${
                i === 1 ? 'sm:rotate-[0.6deg]' : i === 2 ? 'sm:-rotate-[0.6deg]' : ''
              }`}
            >
              <div className="halftone pointer-events-none absolute inset-0 opacity-40" />
              <span className="relative grid h-12 w-12 place-items-center rounded-full border-[3px] border-ink bg-white text-ink">
                <Icon>{style.icon}</Icon>
              </span>
              <span className="ink-outline absolute top-4 right-5 rotate-6 font-display text-4xl tracking-wide text-pop transition-transform duration-200 group-hover:scale-125 group-hover:rotate-12">
                {style.word}
              </span>
              <div className="relative mt-6">
                <h3 className="text-3xl tracking-wider uppercase">{CATEGORY_LABELS[cat].title}</h3>
                <p className="mt-1 text-sm font-semibold opacity-90">{byCat(cat).length} titles →</p>
              </div>
            </Link>
          );
        })}
      </section>

      {byCat('games').length > 0 && (
        <Shelf title="Hot games" subtitle={CATEGORY_LABELS.games.blurb} href="/?c=games" color="bg-accent text-white">
          {byCat('games').map((g) => (
            <StoreCard key={g.id} game={g} />
          ))}
        </Shelf>
      )}

      {byCat('services').length > 0 && (
        <Shelf title="Apps & wallets" subtitle={CATEGORY_LABELS.services.blurb} href="/?c=services" color="bg-cyan text-ink">
          {byCat('services').map((g) => (
            <StoreCard key={g.id} game={g} wide />
          ))}
        </Shelf>
      )}

      {operators.length > 0 && (
        <Shelf title="Mobile balance" subtitle={CATEGORY_LABELS.mobile.blurb} href="/?c=mobile" color="bg-magenta text-white">
          {operators.map((g) => (
            <StoreCard key={g.id} game={g} />
          ))}
        </Shelf>
      )}

      {/* How it works — a three-panel strip */}
      <section>
        <SectionTitle color="bg-pop text-ink">How it works</SectionTitle>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          <StripPanel n="1" bg="bg-white" title="Pick a pack" caption="Choose the game and how much you want.">
            <Bubble>That one! 660 UC!</Bubble>
          </StripPanel>
          <StripPanel n="2" bg="bg-cyan" title="We check your ID" caption="Before you pay, we confirm the account exists.">
            <Bubble>Found you: “ProGamer_UZ” ✓</Bubble>
          </StripPanel>
          <StripPanel n="3" bg="bg-pop" title="Delivered!" caption="Usually in about a minute. Watch it live.">
            <Burst className="h-32 w-32 -rotate-6 text-4xl" color="bg-accent">
              <span className="text-white">POW!</span>
            </Burst>
          </StripPanel>
        </div>
      </section>

      {/* Promises */}
      <section className="grid gap-5 md:grid-cols-3">
        <Promise
          icon={<path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6l-7-3ZM9 12l2 2 4-4" />}
          title="No typos, no losses"
          body="We ask the supplier whether the ID, username or number exists before you pay."
        />
        <Promise icon={<path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />} title="Live tracking" body="Paid, queued, delivering, delivered: your order page updates on its own." />
        <Promise
          icon={<path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />}
          title="Failed? Refunded."
          body="A failed top-up goes to a real person. If it can’t be delivered, your money comes back."
        />
      </section>

      {/* Tools */}
      <section className="grid gap-5 md:grid-cols-2">
        {operators.length > 0 && <OperatorFinder operators={operators} />}
        <Link href="/guides" className="card group flex flex-col justify-between bg-pop p-6 transition-all hover:-translate-y-1 hover:shadow-comic-lg">
          <div>
            <h3 className="text-3xl tracking-wider uppercase">Where is my player ID?</h3>
            <p className="mt-2 text-sm font-medium leading-relaxed">
              Every game and app hides your ID, UID or username somewhere different. One page shows them all, with examples.
            </p>
          </div>
          <span className="mt-6 font-display text-xl tracking-wider uppercase">
            Open the ID guide <span className="inline-block transition-transform group-hover:translate-x-1.5">→</span>
          </span>
        </Link>
      </section>

      {/* FAQ */}
      <section className="grid gap-8 md:grid-cols-[1fr_2fr]">
        <div>
          <div className="bubble inline-block rounded-3xl border-[3px] border-ink bg-white px-6 py-4 shadow-comic-sm">
            <h2 className="text-4xl tracking-wider uppercase">Questions?</h2>
          </div>
          <p className="mt-8 text-sm font-medium text-muted">The things people ask before their first order.</p>
          <Link href="/help" className="link mt-3 inline-block text-sm">
            All questions →
          </Link>
        </div>
        <Faq limit={4} />
      </section>
    </div>
  );
}

function StripPanel({ n, bg, title, caption, children }: { n: string; bg: string; title: string; caption: string; children: ReactNode }) {
  return (
    <div className={`panel relative flex min-h-[260px] flex-col overflow-hidden ${bg}`}>
      <div className="halftone pointer-events-none absolute inset-0 opacity-25" />
      <p className="relative border-b-[3px] border-ink bg-pop px-4 py-2 text-sm font-bold">
        <span className="font-display text-lg">{n}.</span> {caption}
      </p>
      <div className="relative grid flex-1 place-items-center p-6">{children}</div>
      <p className="relative px-5 pb-4 font-display text-3xl tracking-wider uppercase">{title}</p>
    </div>
  );
}

function Bubble({ children }: { children: ReactNode }) {
  return <p className="bubble -rotate-2 rounded-3xl border-[3px] border-ink bg-white px-5 py-3 text-lg font-bold">{children}</p>;
}

function Promise({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="card p-6">
      <span className="grid h-12 w-12 place-items-center rounded-full border-[3px] border-ink bg-pop">
        <Icon>{icon}</Icon>
      </span>
      <h3 className="mt-4 text-3xl tracking-wider uppercase">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed font-medium text-muted">{body}</p>
    </div>
  );
}
