/** Storefront sections. A catalogue entry ("game" in the data model) belongs to exactly one. */
export const CATALOG_CATEGORIES = ['games', 'services', 'mobile'] as const;
export type CatalogCategory = (typeof CATALOG_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<CatalogCategory, { title: string; short: string; blurb: string }> = {
  games: { title: 'Game currency', short: 'Games', blurb: 'UC, Diamonds, Gems, Robux and more — sent straight to your player ID.' },
  services: { title: 'Apps & wallets', short: 'Apps & wallets', blurb: 'Telegram Premium and Stars, Steam and PlayStation wallet top-ups.' },
  mobile: { title: 'Mobile balance', short: 'Mobile', blurb: 'Top up any Uzbek mobile number — Beeline, Ucell, Mobiuz, Uzmobile.' },
};

export function isCatalogCategory(v: unknown): v is CatalogCategory {
  return typeof v === 'string' && (CATALOG_CATEGORIES as readonly string[]).includes(v);
}
