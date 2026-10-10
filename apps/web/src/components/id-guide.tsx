'use client';

import { CATALOG_CATEGORIES, CATEGORY_LABELS } from '@donat/shared';
import Link from 'next/link';
import { useState } from 'react';
import { GameArt } from './game-art';
import { OperatorFinder } from './operator-finder';
import { EmptyState, ErrorBox, Loading } from './ui';
import { useApi } from '@/lib/hooks';
import type { GameSummary } from '@/lib/types';

/** Paste-and-check: does this ID match the format the store expects for this entry? */
function FormatCheck({ item }: { item: GameSummary }) {
  const [value, setValue] = useState('');
  let ok: boolean | null = null;
  if (value.trim()) {
    try {
      ok = new RegExp(item.playerIdPattern).test(value.trim());
    } catch {
      ok = null;
    }
  }
  return (
    <div className="flex items-center gap-2">
      <input
        className="input h-10 text-sm"
        placeholder={`Paste your ${item.playerIdLabel.toLowerCase()}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label={`Check a ${item.name} ${item.playerIdLabel}`}
      />
      <span className={`w-24 shrink-0 text-xs ${ok ? 'text-ok' : ok === false ? 'text-bad' : 'text-muted'}`} aria-live="polite">
        {ok ? '✓ looks right' : ok === false ? '✗ wrong format' : ''}
      </span>
    </div>
  );
}

export function IdGuide() {
  const [q, setQ] = useState('');
  const { data, error, loading } = useApi<{ games: GameSummary[] }>('/catalog/games');
  const catalog = data?.games ?? [];
  const needle = q.toLowerCase().trim();
  const items = catalog.filter((g) => !needle || g.name.toLowerCase().includes(needle));
  const operators = catalog.filter((g) => g.category === 'mobile');

  if (loading && !data) return <Loading />;

  return (
    <div className="space-y-14">
      <ErrorBox message={error} />
      <div className="grid gap-5 md:grid-cols-2">
        <input className="input h-12 text-[15px]" placeholder="Filter by name…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter" />
        {operators.length > 0 && <OperatorFinder operators={operators} />}
      </div>

      {items.length === 0 && <EmptyState title={`Nothing called “${q}”`}>Try a shorter word.</EmptyState>}

      {CATALOG_CATEGORIES.map((cat) => {
        const section = items.filter((g) => g.category === cat);
        if (!section.length) return null;
        return (
          <section key={cat}>
            <h2 className="mb-5 inline-block -rotate-1 border-[3px] border-ink bg-ink px-4 pt-1.5 pb-1 text-3xl tracking-wider text-pop uppercase shadow-comic-sm">{CATEGORY_LABELS[cat].title}</h2>
            <ul className="space-y-4">
              {section.map((g) => (
                <li key={g.id} className="card grid gap-4 p-4 md:grid-cols-[48px_1fr_320px] md:items-center">
                  <div className="hidden h-12 w-12 overflow-hidden rounded-md border-[2.5px] border-ink md:block">
                    <GameArt name={g.name} slug={g.slug} imageUrl={g.imageUrl} variant="thumb" />
                  </div>
                  <div>
                    <p className="flex flex-wrap items-baseline gap-x-3">
                      <span className="font-display text-2xl tracking-wide">{g.name}</span>
                      <span className="text-xs text-muted">{g.playerIdLabel}</span>
                    </p>
                    <p className="mt-1 text-sm text-muted">{g.playerIdHelp ?? 'Shown on your profile.'}</p>
                    <Link href={`/games/${g.slug}`} className="link mt-2 inline-block text-sm">
                      Top up {g.name}
                    </Link>
                  </div>
                  <FormatCheck item={g} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
