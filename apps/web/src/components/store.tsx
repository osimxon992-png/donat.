'use client';

import { CATEGORY_LABELS } from '@donat/shared';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { GameArt } from './game-art';
import { money } from '@/lib/format';
import type { GameSummary } from '@/lib/types';

const SLIDE_MS = 6000;

/** Starburst sticker, e.g. a price callout. */
export function Burst({ children, className = '', color = 'bg-pop' }: { children: ReactNode; className?: string; color?: string }) {
  return (
    <span className={`relative inline-grid place-items-center ${className}`}>
      <span className="burst absolute inset-0 translate-x-[4px] translate-y-[4px] bg-ink" />
      <span className="burst absolute inset-0 bg-ink" />
      <span className={`burst absolute inset-[3px] ${color}`} />
      <span className="relative px-5 text-center font-display leading-[0.95] tracking-wide text-ink">{children}</span>
    </span>
  );
}

/** Big comic-panel banner that flips through featured titles. */
export function HeroSlider({ games }: { games: GameSummary[] }) {
  const [{ index, prev }, setSlide] = useState({ index: 0, prev: -1 });
  const [paused, setPaused] = useState(false);
  const count = games.length;
  // The previous slide stays underneath while the new one fades in, so nothing flashes.
  const go = useCallback((i: number) => setSlide((s) => ({ index: ((i % count) + count) % count, prev: s.index })), [count]);

  useEffect(() => {
    if (paused || count < 2) return;
    const t = setTimeout(() => go(index + 1), SLIDE_MS);
    return () => clearTimeout(t);
  }, [index, paused, count, go]);

  if (!count) return null;

  return (
    <section
      className="relative isolate overflow-hidden rounded-[14px] border-4 border-ink bg-white shadow-comic-lg"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Featured"
    >
      <div className="relative h-[460px] sm:h-[480px] lg:h-[520px]">
        {games.map((g, i) => {
          const active = i === index;
          return (
            <div
              key={g.id}
              className={`absolute inset-0 ${active ? 'visible z-10' : i === prev ? 'visible z-0' : 'invisible z-0'}`}
              style={active && prev >= 0 ? { animation: 'fade-in 500ms ease-out both' } : undefined}
              aria-hidden={!active}
              aria-roledescription="slide"
            >
              <div className={`absolute inset-0 transition-transform duration-[7000ms] ease-out ${active ? 'scale-105' : 'scale-100'}`}>
                <GameArt name={g.name} slug={g.slug} imageUrl={g.imageUrl} variant="banner" />
              </div>

              <div className="relative flex h-full max-w-2xl flex-col justify-end gap-4 px-5 pb-20 sm:px-10 sm:pb-24 lg:px-12 lg:pb-28">
                <span
                  className="w-fit -rotate-2 border-[3px] border-ink bg-white px-3 py-1 font-display text-lg tracking-wider text-ink uppercase shadow-comic-sm"
                  style={active ? { animation: 'pop-in 450ms 80ms both' } : undefined}
                >
                  {CATEGORY_LABELS[g.category]?.title}
                </span>
                <h2
                  className="ink-outline text-[52px] leading-[0.9] tracking-wide text-white sm:text-[76px] lg:text-[92px]"
                  style={active ? { animation: 'pop-in 500ms 160ms both' } : undefined}
                >
                  {g.name}
                </h2>
                <p
                  className="bubble max-w-md rounded-2xl border-[3px] border-ink bg-white px-4 py-3 text-[15px] font-medium text-ink shadow-comic-sm"
                  style={active ? { animation: 'pop-in 500ms 260ms both' } : undefined}
                >
                  {g.description ?? `${g.currencyName} delivered straight to your account.`}
                </p>
                <div className="mt-5 flex items-center gap-5" style={active ? { animation: 'pop-in 500ms 360ms both' } : undefined}>
                  <Link href={`/games/${g.slug}`} tabIndex={active ? 0 : -1} className="btn-accent h-14 px-8 text-2xl">
                    Top up now!
                  </Link>
                </div>
              </div>

              {g.fromPriceMinor != null && (
                <div className="absolute top-6 right-6 hidden sm:block lg:top-10 lg:right-12" style={active ? { animation: 'pop-in 600ms 450ms both' } : undefined}>
                  <Burst className="h-36 w-36 rotate-12 text-2xl lg:h-44 lg:w-44 lg:text-3xl">
                    from
                    <br />
                    <span className="text-[1.4em]">{money(g.fromPriceMinor, g.currency)}</span>
                  </Burst>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Thumbnails (desktop) */}
      <div className="absolute right-6 bottom-6 z-20 hidden gap-3 lg:flex">
        {games.map((g, i) => (
          <button
            key={g.id}
            onClick={() => go(i)}
            className={`relative h-[70px] w-[110px] overflow-hidden rounded-md border-[3px] border-ink transition-all duration-200 ${
              i === index ? '-translate-y-1 shadow-comic' : 'opacity-80 hover:-translate-y-0.5 hover:opacity-100'
            }`}
            aria-label={`Show ${g.name}`}
            aria-current={i === index}
          >
            <GameArt name={g.name} slug={g.slug} imageUrl={g.imageUrl} variant="thumb" className="text-2xl" />
            {i === index && !paused && count > 1 && (
              <span key={index} className="absolute bottom-0 left-0 h-[5px] bg-pop" style={{ animation: `slide-progress ${SLIDE_MS}ms linear forwards` }} />
            )}
          </button>
        ))}
      </div>

      {/* Dots (mobile) */}
      <div className="absolute bottom-6 left-5 z-20 flex items-center gap-2 sm:left-10 lg:hidden">
        {games.map((g, i) => (
          <button
            key={g.id}
            onClick={() => go(i)}
            className={`h-3.5 rounded-full border-2 border-ink transition-all ${i === index ? 'w-9 bg-pop' : 'w-3.5 bg-white'}`}
            aria-label={`Show ${g.name}`}
          />
        ))}
      </div>
      {count > 1 && (
        <div className="absolute right-5 bottom-5 z-20 flex gap-2 lg:top-5 lg:right-auto lg:bottom-auto lg:left-5">
          <RoundArrow dir="left" onClick={() => go(index - 1)} />
          <RoundArrow dir="right" onClick={() => go(index + 1)} />
        </div>
      )}
    </section>
  );
}

function RoundArrow({ dir, onClick, disabled }: { dir: 'left' | 'right'; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="grid h-10 w-10 place-items-center rounded-full border-[3px] border-ink bg-white text-ink shadow-comic-sm transition hover:bg-pop active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:opacity-40 disabled:hover:bg-white"
      aria-label={dir === 'left' ? 'Previous' : 'Next'}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {dir === 'left' ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
      </svg>
    </button>
  );
}

/** Section title in a tilted caption box. */
export function SectionTitle({ children, sub, color = 'bg-ink text-pop' }: { children: ReactNode; sub?: string; color?: string }) {
  return (
    <div>
      <h2 className={`inline-block -rotate-1 border-[3px] border-ink px-4 pt-1.5 pb-1 text-[30px] tracking-wider uppercase shadow-comic-sm sm:text-4xl ${color}`}>
        {children}
      </h2>
      {sub && <p className="mt-3 text-sm font-medium text-muted">{sub}</p>}
    </div>
  );
}

/** A titled, horizontally scrolling strip of store cards. */
export function Shelf({
  title,
  subtitle,
  href,
  color,
  children,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  color?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
  }, []);

  useEffect(() => {
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [update]);

  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: 'smooth' });

  return (
    <section>
      <div className="mb-5 flex items-end justify-between gap-4">
        <SectionTitle sub={subtitle} color={color}>
          {title}
        </SectionTitle>
        <div className="flex shrink-0 items-center gap-2">
          {href && (
            <Link href={href} className="link mr-2 text-sm">
              See all
            </Link>
          )}
          <div className="hidden gap-2 sm:flex">
            <RoundArrow dir="left" onClick={() => scroll(-1)} disabled={edges.start} />
            <RoundArrow dir="right" onClick={() => scroll(1)} disabled={edges.end} />
          </div>
        </div>
      </div>
      <div
        ref={ref}
        onScroll={update}
        className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth px-4 pt-2 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
      >
        {children}
      </div>
    </section>
  );
}

/** Comic-panel store card: cover art with the title, price tag underneath. */
export function StoreCard({ game: g, wide = false, fluid = false }: { game: GameSummary; wide?: boolean; fluid?: boolean }) {
  const width = fluid ? 'w-full' : wide ? 'w-[300px] sm:w-[360px]' : 'w-[170px] sm:w-[200px]';
  return (
    <Link href={`/games/${g.slug}`} className={`group block shrink-0 snap-start ${width}`}>
      <div
        className={`relative overflow-hidden rounded-[10px] border-[3px] border-ink shadow-comic transition-all duration-200 group-hover:-translate-y-1.5 group-hover:-rotate-1 group-hover:shadow-comic-lg ${
          wide ? 'aspect-[16/9]' : 'aspect-[3/4]'
        }`}
      >
        <div className="h-full w-full transition-transform duration-300 group-hover:scale-105">
          <GameArt name={g.name} slug={g.slug} imageUrl={g.imageUrl} label={g.currencyName} variant={wide ? 'wide' : 'cover'} />
        </div>
        {wide && (
          <div className="absolute inset-x-3 bottom-3">
            <span className="mb-1 inline-block border-2 border-ink bg-pop px-2 py-0.5 font-display text-sm tracking-wider uppercase shadow-comic-sm">{g.currencyName}</span>
            <p className="ink-outline font-display text-4xl leading-none tracking-wide text-white">{g.name}</p>
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 px-0.5">
        <p className="truncate text-sm font-bold">{g.name}</p>
        {g.fromPriceMinor != null && (
          <span className="shrink-0 rotate-2 border-2 border-ink bg-white px-1.5 font-display text-lg leading-tight tracking-wide shadow-comic-sm transition-colors group-hover:bg-pop">
            {money(g.fromPriceMinor, g.currency)}
          </span>
        )}
      </div>
    </Link>
  );
}
