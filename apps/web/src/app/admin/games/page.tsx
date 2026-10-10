'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { GameArt } from '@/components/game-art';
import { EMPTY_GAME, GameForm, toGamePayload } from '@/components/game-form';
import { EmptyState, ErrorBox, Loading, PageHeader, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';

interface AdminGame {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  isActive: boolean;
  currencyName: string;
  deletedAt: string | null;
  _count: { products: number; orders: number };
}

export default function AdminGamesPage() {
  const { can } = useAuth();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const { data, error, loading } = useApi<{ games: AdminGame[] }>('/admin/games');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Games & packages"
        actions={
          can('games:write') && (
            <button className="btn-primary" onClick={() => setCreating((c) => !c)}>
              {creating ? 'Close' : 'Add game'}
            </button>
          )
        }
      />
      {creating && (
        <div className="card p-5">
          <h2 className="mb-4 font-semibold">New game</h2>
          <GameForm
            initial={EMPTY_GAME}
            submitLabel="Create game"
            onSubmit={async (v) => {
              const res = await api<{ game: { id: string } }>('/admin/games', { method: 'POST', body: toGamePayload(v) });
              router.push(`/admin/games/${res.game.id}`);
            }}
          />
        </div>
      )}
      <ErrorBox message={error} />
      {loading && !data ? (
        <Loading />
      ) : !data?.games.length ? (
        <EmptyState title="No games yet" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.games.map((g) => (
            <Link key={g.id} href={`/admin/games/${g.id}`} className="card flex items-center gap-4 p-3 hover:border-muted">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[8px]">
                <GameArt name={g.name} slug={g.slug} imageUrl={g.imageUrl} variant="thumb" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{g.name}</p>
                <p className="text-xs text-muted">
                  {g._count.products} packages · {g._count.orders} orders
                </p>
              </div>
              <StatusBadge status={g.isActive ? 'ACTIVE' : 'CANCELLED'} label={g.isActive ? 'Enabled' : 'Disabled'} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
