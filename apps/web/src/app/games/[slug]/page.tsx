'use client';

import { CATEGORY_LABELS } from '@donat/shared';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { GameArt } from '@/components/game-art';
import { ReceiptRow } from '@/components/receipt';
import { ErrorBox, Loading, Spinner } from '@/components/ui';
import { api, errorMessage, newIdempotencyKey } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { CustomerOrder, GameDetail, Product, SavedPlayer } from '@/lib/types';

/** Product with the lowest price per unit (integer cross-multiplication, no floats). */
function bestValueId(products: Product[]): string | undefined {
  let best: Product | undefined;
  for (const p of products) {
    const units = p.amount + p.bonusAmount;
    if (!best) {
      best = p;
      continue;
    }
    const bestUnits = best.amount + best.bonusAmount;
    if (p.priceMinor * bestUnits < best.priceMinor * units) best = p;
  }
  return products.length > 2 ? best?.id : undefined;
}

export default function GamePage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { data, error, loading } = useApi<{ game: GameDetail }>(`/catalog/games/${slug}`);
  const saved = useApi<{ players: SavedPlayer[] }>(user ? '/account/saved-players' : null);
  const game = data?.game;

  const [productId, setProductId] = useState<string>();
  const [playerId, setPlayerId] = useState('');
  const [serverId, setServerId] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [showPromo, setShowPromo] = useState(false);
  const [savePlayer, setSavePlayer] = useState(true);
  const [verified, setVerified] = useState<{ nickname: string | null; key: string }>();
  const [verifying, setVerifying] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [formError, setFormError] = useState<string>();
  // One idempotency key per checkout intent: a double click or retry can't create two orders.
  const [idemKey, setIdemKey] = useState(newIdempotencyKey);

  useEffect(() => {
    if (game && !productId) setProductId((game.products.find((p) => p.isFeatured) ?? game.products[0])?.id);
  }, [game, productId]);

  const product = game?.products.find((p) => p.id === productId);
  const playerKey = `${playerId}|${serverId}`;
  const isVerified = verified?.key === playerKey;
  const savedForGame = useMemo(() => saved.data?.players.filter((p) => p.game.slug === slug) ?? [], [saved.data, slug]);
  const bestId = useMemo(() => (game ? bestValueId(game.products) : undefined), [game]);
  const patternOk = useMemo(() => {
    if (!game || !playerId) return false;
    try {
      return new RegExp(game.playerIdPattern).test(playerId);
    } catch {
      return true;
    }
  }, [game, playerId]);

  useEffect(() => setIdemKey(newIdempotencyKey()), [productId, playerKey, promoCode]);

  async function verify() {
    if (!game) return;
    setVerifying(true);
    setFormError(undefined);
    try {
      const res = await api<{ valid: boolean; nickname: string | null }>(`/catalog/games/${game.slug}/validate-player`, {
        method: 'POST',
        body: { playerId, serverId },
      });
      setVerified({ nickname: res.nickname, key: playerKey });
    } catch (err) {
      setVerified(undefined);
      setFormError(errorMessage(err));
    } finally {
      setVerifying(false);
    }
  }

  async function buy() {
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(`/games/${slug}`)}`);
      return;
    }
    if (!product) return;
    setCheckingOut(true);
    setFormError(undefined);
    try {
      const res = await api<{ order: CustomerOrder; payment: { id: string } | null }>('/orders', {
        method: 'POST',
        headers: { 'Idempotency-Key': idemKey },
        body: { productId: product.id, playerId, serverId, promoCode: promoCode || undefined, savePlayer },
      });
      if (res.payment) router.push(`/checkout/${res.order.id}/pay?payment=${res.payment.id}`);
      else router.push(`/orders/${res.order.id}`);
    } catch (err) {
      setFormError(errorMessage(err));
      setCheckingOut(false);
    }
  }

  if (loading && !game) return <Loading />;
  if (error || !game) return <ErrorBox message={error ?? 'Game not found'} />;

  return (
    <div>
      <nav className="mb-5 flex items-center gap-2 text-sm font-semibold text-muted">
        <Link href="/" className="hover:text-text">
          Home
        </Link>
        <span aria-hidden>›</span>
        <Link href={`/?c=${game.category}`} className="hover:text-text">
          {CATEGORY_LABELS[game.category]?.short ?? 'Store'}
        </Link>
        <span aria-hidden>›</span>
        <span className="text-text">{game.name}</span>
      </nav>

      {/* Game header */}
      <section className="relative mb-10 h-[260px] overflow-hidden rounded-[14px] border-4 border-ink shadow-comic-lg sm:h-[300px]">
        <GameArt name={game.name} slug={game.slug} imageUrl={game.imageUrl} variant="banner" />
        <div className="absolute inset-x-5 bottom-5 flex flex-col gap-3 sm:inset-x-8 sm:bottom-7">
          <span className="w-fit -rotate-2 border-[3px] border-ink bg-pop px-3 py-0.5 font-display text-lg tracking-wider uppercase shadow-comic-sm">
            {game.currencyName}
          </span>
          <h1 className="ink-outline text-6xl leading-[0.9] tracking-wide text-white sm:text-8xl">{game.name}</h1>
          {game.description && (
            <p className="hidden max-w-xl rounded-lg border-[3px] border-ink bg-white px-3 py-2 text-sm font-medium shadow-comic-sm sm:block">{game.description}</p>
          )}
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {/* Step 1 */}
          <section className="card p-5 sm:p-6">
            <StepTitle n="1" title="Choose a package" />
            <div className="grid grid-cols-2 gap-x-3 gap-y-4 pt-2 sm:grid-cols-3">
              {game.products.map((p) => {
                const selected = p.id === productId;
                const total = p.amount + p.bonusAmount;
                return (
                  <button
                    key={p.id}
                    onClick={() => setProductId(p.id)}
                    aria-pressed={selected}
                    className={`relative flex flex-col rounded-[10px] border-[3px] border-ink p-4 text-left transition-all duration-100 ${
                      selected ? '-translate-y-1 -rotate-1 bg-pop shadow-comic' : 'bg-white shadow-comic-sm hover:-translate-y-0.5 hover:bg-pop/30'
                    }`}
                  >
                    {(p.id === bestId || p.isFeatured) && (
                      <span className="absolute -top-3.5 right-2 flex rotate-3 gap-1">
                        {p.id === bestId && <span className="border-2 border-ink bg-ok px-1.5 font-display text-sm tracking-wider text-white uppercase">Best value</span>}
                        {p.isFeatured && <span className="border-2 border-ink bg-accent px-1.5 font-display text-sm tracking-wider text-white uppercase">Hot!</span>}
                      </span>
                    )}
                    <span className="font-display text-4xl leading-none tracking-wide tabular-nums">{total.toLocaleString('en-US')}</span>
                    <span className="mt-1 text-xs font-semibold text-muted">
                      {game.currencyName}
                      {p.bonusAmount > 0 && <span className="text-ok"> +{p.bonusAmount.toLocaleString('en-US')} bonus</span>}
                    </span>
                    <span className="mt-4 border-t-[2.5px] border-dashed border-ink pt-2 font-display text-2xl tracking-wide">{money(p.priceMinor, p.currency)}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Step 2 */}
          <section className="card p-5 sm:p-6">
            <StepTitle n="2" title={`Your ${game.playerIdLabel}`} />
            {savedForGame.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                <span className="self-center text-sm text-muted">Saved:</span>
                {savedForGame.map((s) => (
                  <button
                    key={s.id}
                    className="rounded-lg border-[2.5px] border-ink bg-white px-3 py-1.5 text-left text-xs shadow-comic-sm hover:bg-pop"
                    onClick={() => {
                      setPlayerId(s.playerId);
                      setServerId(s.serverId);
                    }}
                  >
                    <span className="font-medium">{s.label || s.nickname || 'Player'}</span> <span className="text-muted">{s.playerId}</span>
                  </button>
                ))}
              </div>
            )}
            <div className={`grid gap-3 ${game.requiresServer ? 'sm:grid-cols-[1fr_200px]' : ''}`}>
              <label className="block">
                <span className="label">{game.playerIdLabel}</span>
                <input
                  className="input h-12 text-base"
                  inputMode="numeric"
                  autoComplete="off"
                  value={playerId}
                  onChange={(e) => setPlayerId(e.target.value.trim())}
                  onKeyDown={(e) => e.key === 'Enter' && patternOk && void verify()}
                  placeholder="5123456789"
                  maxLength={32}
                />
              </label>
              {game.requiresServer && (
                <label className="block">
                  <span className="label">{game.servers.length ? 'Server' : 'Zone ID'}</span>
                  {game.servers.length ? (
                    <select className="input h-12" value={serverId} onChange={(e) => setServerId(e.target.value)}>
                      <option value="">Choose…</option>
                      {game.servers.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input className="input h-12" value={serverId} onChange={(e) => setServerId(e.target.value.trim())} placeholder="1234" maxLength={32} />
                  )}
                </label>
              )}
            </div>
            {game.playerIdHelp && <p className="mt-2 text-xs text-muted">{game.playerIdHelp}</p>}

            <div className="mt-4 flex flex-wrap items-center gap-4">
              <button className="btn-secondary" disabled={!patternOk || verifying || (game.requiresServer && !serverId)} onClick={verify}>
                {verifying && <Spinner />} Check player
              </button>
              {isVerified ? (
                <p className="flex items-center gap-2 text-sm">
                  <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-ink bg-ok text-xs font-bold text-white">✓</span>
                  Found <strong>{verified?.nickname ?? 'player'}</strong>
                </p>
              ) : (
                playerId &&
                !patternOk && <p className="text-sm text-warn">That doesn’t look like a {game.name} {game.playerIdLabel}.</p>
              )}
            </div>
            {user && (
              <label className="mt-4 flex items-center gap-2 text-sm text-muted">
                <input type="checkbox" checked={savePlayer} onChange={(e) => setSavePlayer(e.target.checked)} />
                Remember this ID for next time
              </label>
            )}
          </section>
        </div>

        {/* Summary */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="card p-5 sm:p-6">
            <p className="font-display text-3xl tracking-wider uppercase">Your order</p>
            <div className="rule-dashed my-4" />
            <div className="space-y-2.5">
              <ReceiptRow label="Package" value={product ? `${(product.amount + product.bonusAmount).toLocaleString('en-US')} ${game.currencyName}` : '—'} />
              <ReceiptRow label={game.playerIdLabel} value={playerId || '—'} />
              {game.requiresServer && <ReceiptRow label="Server" value={serverId || '—'} />}
              <ReceiptRow label="Player" value={isVerified ? (verified?.nickname ?? 'verified') : 'not checked'} />
            </div>
            <div className="rule-dashed my-4" />
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted">Total</span>
              <span className="font-display text-5xl tracking-wide tabular-nums">{product ? money(product.priceMinor, product.currency) : '—'}</span>
            </div>

            {showPromo ? (
              <div className="mt-4 flex gap-2">
                <input
                  className="input uppercase"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase().trim())}
                  placeholder="PROMO CODE"
                  maxLength={32}
                  aria-label="Promo code"
                  autoFocus
                />
              </div>
            ) : (
              <button className="link mt-3 text-sm" onClick={() => setShowPromo(true)}>
                Have a promo code?
              </button>
            )}
            {promoCode && <p className="mt-2 text-xs text-muted">The discount is applied on the payment page.</p>}

            <div className="mt-5 space-y-3">
              <ErrorBox message={formError} />
              <button className="btn-accent h-14 w-full text-2xl" disabled={!product || !isVerified || checkingOut} onClick={buy}>
                {checkingOut && <Spinner />}
                {user ? 'Continue to payment' : 'Sign in to continue'}
              </button>
              {!isVerified && <p className="text-center text-xs text-muted">Check the {game.playerIdLabel.toLowerCase()} first — it takes a second.</p>}
            </div>
          </div>
          <p className="mt-4 text-center text-xs text-muted">
            Questions?{' '}
            <Link href="/help" className="link">
              Read the FAQ
            </Link>
          </p>
        </aside>
      </div>
    </div>
  );
}

function StepTitle({ n, title }: { n: string; title: string }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 -rotate-6 place-items-center rounded-full border-[3px] border-ink bg-accent font-display text-2xl text-white shadow-comic-sm">
        {n}
      </span>
      <h2 className="text-3xl tracking-wider uppercase">{title}</h2>
    </div>
  );
}
