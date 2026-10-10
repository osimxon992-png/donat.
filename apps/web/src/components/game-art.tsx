/* eslint-disable @next/next/no-img-element */

/** Comic cover palettes: [main, highlight]. */
const PALETTES: [string, string][] = [
  ['#ffb81f', '#ff5a1f'], // amber
  ['#ff3b3b', '#ffd21f'], // red
  ['#1e8bff', '#ffd21f'], // blue
  ['#8b4dff', '#19e0ff'], // purple
  ['#2b2b2b', '#ffd21f'], // black
  ['#25c46b', '#ffd21f'], // green
  ['#ff3fa4', '#ffe14d'], // pink
  ['#19b4ff', '#ff3fa4'], // cyan
  ['#ffd21f', '#ff3b3b'], // yellow
];

const KNOWN: Record<string, number> = {
  'pubg-mobile': 0,
  'free-fire': 1,
  'mobile-legends': 2,
  'genshin-impact': 3,
  'cod-mobile': 4,
  'brawl-stars': 8,
  'clash-of-clans': 5,
  roblox: 6,
  'standoff-2': 1,
  'honkai-star-rail': 3,
  'telegram-premium': 7,
  'telegram-stars': 8,
  'steam-wallet': 4,
  'playstation-store': 2,
  'beeline-uz': 8,
  ucell: 3,
  mobiuz: 1,
  uzmobile: 2,
};

function palette(slug: string): [string, string] {
  if (slug in KNOWN) return PALETTES[KNOWN[slug]!]!;
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTES[h % PALETTES.length]!;
}

export function gameColor(slug: string) {
  const [bg, deep] = palette(slug);
  return { bg, deep, fg: '#ffffff' };
}

/** "Call of Duty: Mobile" → "CD", "Clash of Clans" → "CC", "Ucell" → "UC". */
export function initials(name: string) {
  const words = name.split(/[\s:-]+/).filter((w) => w && !/^(of|the|and|a)$/i.test(w));
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/** Flat colour, speed lines radiating from a focus point, halftone shading and a big outlined glyph. */
function Artwork({ slug, name, glyph }: { slug: string; name: string; glyph?: string }) {
  const [main, hi] = palette(slug);
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden" style={{ background: main }}>
      <div
        className="absolute inset-0"
        style={{ background: `repeating-conic-gradient(from 0deg at 72% 38%, ${hi}55 0deg 5deg, transparent 5deg 13deg)` }}
      />
      <div
        className="halftone absolute inset-0"
        style={{ maskImage: 'linear-gradient(200deg, transparent 35%, black 100%)', WebkitMaskImage: 'linear-gradient(200deg, transparent 35%, black 100%)' }}
      />
      <div className="halftone-light absolute -top-[10%] -left-[10%] h-[60%] w-[60%] rounded-full" style={{ maskImage: 'radial-gradient(closest-side, black, transparent)', WebkitMaskImage: 'radial-gradient(closest-side, black, transparent)' }} />
      {glyph && (
        <span
          className="ink-outline absolute top-[8%] right-[4%] -rotate-6 font-display leading-none select-none"
          style={{ fontSize: glyph, color: hi }}
        >
          {initials(name)}
        </span>
      )}
    </div>
  );
}

/**
 * Game artwork. Uses the uploaded image when there is one, otherwise a generated comic cover.
 * - `cover`: tall store card (3:4) with the title on the art
 * - `banner`: hero art, no title (the caller lays text over it); `wide` is the same at card size
 * - `thumb`: small square icon
 */
export function GameArt({
  name,
  slug,
  imageUrl,
  label,
  variant = 'cover',
  className = '',
}: {
  name: string;
  slug: string;
  imageUrl: string | null;
  label?: string;
  variant?: 'cover' | 'banner' | 'wide' | 'thumb' | 'poster';
  className?: string;
}) {
  if (imageUrl) {
    return <img src={imageUrl} alt={name} className={`h-full w-full object-cover ${className}`} />;
  }

  if (variant === 'thumb') {
    return (
      <div className={`relative grid h-full w-full place-items-center overflow-hidden ${className}`} aria-label={name}>
        <Artwork slug={slug} name={name} />
        <span className={`ink-outline relative font-display tracking-wide text-white ${className.includes('text-') ? '' : 'text-xl'}`}>{initials(name)}</span>
      </div>
    );
  }

  if (variant === 'banner' || variant === 'wide') {
    return (
      <div className={`relative h-full w-full ${className}`} aria-label={name}>
        <Artwork slug={slug} name={name} glyph={variant === 'wide' ? '6.5rem' : 'clamp(140px, 24vw, 360px)'} />
      </div>
    );
  }

  return (
    <div className={`relative h-full w-full ${className}`} aria-label={name}>
      <Artwork slug={slug} name={name} glyph="7.5rem" />
      {label && (
        <span className="absolute top-3 left-3 border-2 border-ink bg-pop px-2 py-0.5 font-display text-sm tracking-wider text-ink uppercase shadow-comic-sm">
          {label}
        </span>
      )}
      <p className="ink-outline absolute inset-x-3 bottom-3 font-display text-[28px] leading-[0.95] tracking-wide text-white sm:text-[32px]">{name}</p>
    </div>
  );
}
