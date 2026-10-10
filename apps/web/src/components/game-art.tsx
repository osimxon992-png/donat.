/* eslint-disable @next/next/no-img-element */

/** Hand-picked cover colours: [background, foreground]. */
const SWATCHES: [string, string][] = [
  ['#f5c518', '#161513'], // signal yellow
  ['#ff4f12', '#161513'], // vermilion
  ['#1f3bff', '#f3f0e8'], // cobalt
  ['#6a35e8', '#f3f0e8'], // violet
  ['#161513', '#f3f0e8'], // ink
  ['#0f7b4f', '#f3f0e8'], // field green
  ['#e8dcc4', '#161513'], // sand
];

const KNOWN: Record<string, number> = {
  'pubg-mobile': 0,
  'free-fire': 1,
  'mobile-legends': 2,
  'genshin-impact': 3,
  'cod-mobile': 4,
  'brawl-stars': 0,
  'clash-of-clans': 6,
  roblox: 4,
  'standoff-2': 1,
  'honkai-star-rail': 3,
  'telegram-premium': 3,
  'telegram-stars': 0,
  'steam-wallet': 4,
  'playstation-store': 2,
  'beeline-uz': 0,
  ucell: 3,
  mobiuz: 1,
  uzmobile: 2,
};

function swatch(slug: string): [string, string] {
  if (slug in KNOWN) return SWATCHES[KNOWN[slug]!]!;
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SWATCHES[h % SWATCHES.length]!;
}

export function gameColor(slug: string) {
  const [bg, fg] = swatch(slug);
  return { bg, fg };
}

/**
 * Game cover. Uses the uploaded image when there is one; otherwise a typographic poster:
 * the game's name set large on its colour, with a fine diagonal hatch in one corner.
 */
export function GameArt({
  name,
  slug,
  imageUrl,
  label,
  variant = 'poster',
  className = '',
}: {
  name: string;
  slug: string;
  imageUrl: string | null;
  label?: string;
  variant?: 'poster' | 'thumb';
  className?: string;
}) {
  if (imageUrl) {
    return <img src={imageUrl} alt={name} className={`h-full w-full object-cover ${className}`} />;
  }
  const [bg, fg] = swatch(slug);

  if (variant === 'thumb') {
    const short = name
      .split(/[\s:]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('');
    return (
      <div className={`grid h-full w-full place-items-center font-display text-sm font-extrabold tracking-tight ${className}`} style={{ background: bg, color: fg }} aria-label={name}>
        {short}
      </div>
    );
  }

  return (
    <div className={`relative flex h-full w-full flex-col justify-between overflow-hidden p-4 ${className}`} style={{ background: bg, color: fg }} aria-label={name}>
      <div
        aria-hidden
        className="absolute -top-2 -right-2 h-24 w-24 opacity-25"
        style={{ backgroundImage: `repeating-linear-gradient(135deg, ${fg} 0 1px, transparent 1px 7px)` }}
      />
      {label ? <span className="relative font-mono text-[10px] tracking-[0.16em] uppercase opacity-75">{label}</span> : <span />}
      <span className="relative font-display text-[26px] leading-[0.92] font-extrabold tracking-[-0.04em] break-words sm:text-[30px]">{name}</span>
    </div>
  );
}
