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
        className="input h-9 font-mono text-xs"
        placeholder={`Paste your ${item.playerIdLabel.toLowerCase()}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label={`Check a ${item.name} ${item.playerIdLabel}`}
      />
      <span className={`w-20 shrink-0 font-mono text-[11px] ${ok ? 'text-ok' : ok === false ? 'text-bad' : 'text-muted'}`} aria-live="polite">
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
            <h2 className="mb-4 border-b border-ink/10 pb-3 text-2xl font-bold">{CATEGORY_LABELS[cat].title}</h2>
            <ul className="divide-y divide-ink/10">
              {section.map((g) => (
                <li key={g.id} className="grid gap-4 py-5 md:grid-cols-[48px_1fr_320px] md:items-center">
                  <div className="hidden h-12 w-12 overflow-hidden rounded-[6px] md:block">
                    <GameArt name={g.name} slug={g.slug} imageUrl={g.imageUrl} variant="thumb" />
                  </div>
                  <div>
                    <p className="flex flex-wrap items-baseline gap-x-3">
                      <span className="font-display text-lg font-semibold">{g.name}</span>
                      <span className="font-mono text-xs text-muted">{g.playerIdLabel}</span>
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
