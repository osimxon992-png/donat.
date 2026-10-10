import Link from 'next/link';
import { GameArt } from './game-art';
import { money } from '@/lib/format';
import type { GameSummary } from '@/lib/types';

export function CatalogGrid({ items }: { items: GameSummary[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((g) => (
        <CatalogCard key={g.id} item={g} />
      ))}
    </div>
  );
}

export function CatalogCard({ item: g }: { item: GameSummary }) {
  return (
    <Link href={`/games/${g.slug}`} className="group block">
      <div className="aspect-[3/4] overflow-hidden rounded-[6px] transition-all duration-200 group-hover:-translate-y-1 group-hover:shadow-[5px_5px_0_0_var(--color-ink)]">
        <GameArt name={g.name} slug={g.slug} imageUrl={g.imageUrl} label={g.currencyName} />
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-2">
        <p className="truncate text-[15px] font-semibold">{g.name}</p>
        <span className="text-muted transition-transform group-hover:translate-x-0.5">→</span>
      </div>
      <p className="font-mono text-xs text-muted">from {money(g.fromPriceMinor, g.currency)}</p>
    </Link>
  );
}
