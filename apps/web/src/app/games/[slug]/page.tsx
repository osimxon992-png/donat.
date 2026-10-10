'use client';

import { CATEGORY_LABELS } from '@donat/shared';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { gameColor } from '@/components/game-art';
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
  const color = gameColor(game.slug);

  return (
    <div>
      <nav className="mb-5 font-mono text-xs text-muted">
        <Link href={`/?c=${game.category}`} className="hover:text-text">
          {CATEGORY_LABELS[game.category]?.short ?? 'Store'}
        </Link>{' '}
        / <span className="text-text">{game.name}</span>
      </nav>

      {/* Game band */}
      <section className="relative mb-10 overflow-hidden rounded-[10px] px-6 py-8 sm:px-10 sm:py-12" style={{ background: color.bg, color: color.fg }}>
        <div
          aria-hidden
          className="absolute top-0 right-0 h-full w-1/3 opacity-20"
          style={{ backgroundImage: `repeating-linear-gradient(135deg, ${color.fg} 0 1px, transparent 1px 9px)` }}
        />
        <p className="relative font-mono text-[11px] tracking-[0.16em] uppercase opacity-75">Top up · {game.currencyName}</p>
        <h1 className="relative mt-3 text-5xl leading-[0.9] font-extrabold tracking-[-0.045em] sm:text-7xl">{game.name}</h1>
        {game.description && <p className="relative mt-4 max-w-lg text-[15px] opacity-80">{game.description}</p>}
      </section>

      <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
        <div className="space-y-12">
          {/* Step 1 */}
          <section>
            <StepTitle n="01" title="Choose a package" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {game.products.map((p) => {
                const selected = p.id === productId;
                const total = p.amount + p.bonusAmount;
                return (
                  <button
                    key={p.id}
                    onClick={() => setProductId(p.id)}
                    aria-pressed={selected}
                    className={`group relative flex flex-col rounded-[8px] border p-4 text-left transition-colors ${
                      selected ? 'border-ink bg-ink text-paper' : 'border-ink/15 bg-surface hover:border-ink'
                    }`}
                  >
                    <span className="flex min-h-4 gap-2 font-mono text-[10px] tracking-wider uppercase">
                      {p.id === bestId && <span className={selected ? 'text-accent' : 'text-ok'}>Best value</span>}
                      {p.isFeatured && <span className={selected ? 'text-paper/60' : 'text-muted'}>Popular</span>}
                    </span>
                    <span className="mt-2 font-display text-[28px] leading-none font-bold tracking-tight tabular-nums">{total.toLocaleString('en-US')}</span>
                    <span className={`mt-1 text-xs ${selected ? 'text-paper/70' : 'text-muted'}`}>
                      {game.currencyName}
                      {p.bonusAmount > 0 && (
                        <>
                          {' · '}
                          <span className={selected ? 'text-accent' : 'text-accent-strong'}>incl. {p.bonusAmount.toLocaleString('en-US')} bonus</span>
                        </>
                      )}
                    </span>
                    <span className={`mt-4 border-t border-dashed pt-3 font-mono text-sm font-medium ${selected ? 'border-paper/25' : 'border-ink/20'}`}>
                      {money(p.priceMinor, p.currency)}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Step 2 */}
          <section>
            <StepTitle n="02" title={`Your ${game.playerIdLabel}`} />
            {savedForGame.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                <span className="eyebrow self-center">Saved:</span>
                {savedForGame.map((s) => (
                  <button
                    key={s.id}
                    className="rounded-md border border-ink/15 bg-surface px-3 py-1.5 text-left text-xs hover:border-ink"
                    onClick={() => {
                      setPlayerId(s.playerId);
                      setServerId(s.serverId);
                    }}
                  >
                    <span className="font-medium">{s.label || s.nickname || 'Player'}</span> <span className="font-mono text-muted">{s.playerId}</span>
                  </button>
                ))}
              </div>
            )}
            <div className={`grid gap-3 ${game.requiresServer ? 'sm:grid-cols-[1fr_200px]' : ''}`}>
              <label className="block">
                <span className="label">{game.playerIdLabel}</span>
                <input
                  className="input h-12 font-mono text-base tracking-wide"
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
                    <input className="input h-12 font-mono" value={serverId} onChange={(e) => setServerId(e.target.value.trim())} placeholder="1234" maxLength={32} />
                  )}
                </label>
              )}
            </div>
            {game.playerIdHelp && <p className="mt-2 text-xs text-muted">{game.playerIdHelp}</p>}

            <div className="mt-4 flex flex-wrap items-center gap-4">
              <button className="btn-primary" disabled={!patternOk || verifying || (game.requiresServer && !serverId)} onClick={verify}>
                {verifying && <Spinner />} Check player
              </button>
              {isVerified ? (
                <p className="flex items-center gap-2 text-sm">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-ok text-[11px] text-white">✓</span>
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
          <div className="bg-surface px-5 pt-5 pb-5 shadow-[0_1px_0_rgba(22,21,19,0.06),0_16px_36px_-24px_rgba(22,21,19,0.5)]">
            <div className="flex items-baseline justify-between font-mono text-[11px] tracking-wide text-muted uppercase">
              <span>Your order</span>
              <span>{game.name}</span>
            </div>
            <div className="rule-dashed my-4" />
            <div className="space-y-2">
              <ReceiptRow label="Package" value={product ? `${(product.amount + product.bonusAmount).toLocaleString('en-US')} ${game.currencyName}` : '—'} />
              <ReceiptRow label={game.playerIdLabel} value={playerId || '—'} />
              {game.requiresServer && <ReceiptRow label="Server" value={serverId || '—'} />}
              <ReceiptRow label="Player" value={isVerified ? (verified?.nickname ?? 'verified') : 'not checked'} />
            </div>
            <div className="rule-dashed my-4" />
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[13px] text-muted">Total</span>
              <span className="font-display text-3xl font-bold tracking-tight tabular-nums">{product ? money(product.priceMinor, product.currency) : '—'}</span>
            </div>

            {showPromo ? (
              <div className="mt-4 flex gap-2">
                <input
                  className="input font-mono uppercase"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase().trim())}
                  placeholder="PROMO CODE"
                  maxLength={32}
                  aria-label="Promo code"
                  autoFocus
                />
              </div>
            ) : (
              <button className="mt-3 text-xs text-muted underline underline-offset-4 hover:text-text" onClick={() => setShowPromo(true)}>
                Have a promo code?
              </button>
            )}
            {promoCode && <p className="mt-2 text-xs text-muted">The discount is applied on the payment page.</p>}

            <div className="mt-5 space-y-3">
              <ErrorBox message={formError} />
              <button className="btn-accent h-12 w-full text-[15px]" disabled={!product || !isVerified || checkingOut} onClick={buy}>
                {checkingOut && <Spinner />}
                {user ? 'Continue to payment' : 'Sign in to continue'}
              </button>
              {!isVerified && <p className="text-center text-xs text-muted">Check the {game.playerIdLabel.toLowerCase()} first — it takes a second.</p>}
            </div>
          </div>
          <div className="receipt-edge" />
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
    <div className="mb-5 flex items-baseline gap-3">
      <span className="font-mono text-xs text-accent">{n}</span>
      <h2 className="text-2xl font-bold">{title}</h2>
    </div>
  );
}
