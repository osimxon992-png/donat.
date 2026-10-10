'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { EmptyState, ErrorBox, Field, Loading, PageHeader, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction, useApi } from '@/lib/hooks';
import type { GameSummary, SavedPlayer } from '@/lib/types';

export default function SavedPlayersPage() {
  const players = useApi<{ players: SavedPlayer[] }>('/account/saved-players');
  const games = useApi<{ games: GameSummary[] }>('/catalog/games');
  const [form, setForm] = useState({ gameId: '', playerId: '', serverId: '', label: '' });
  const add = useAction();
  const remove = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await add.run(() => api('/account/saved-players', { method: 'POST', body: { ...form, label: form.label || undefined } }));
    if (ok) {
      setForm({ gameId: form.gameId, playerId: '', serverId: '', label: '' });
      await players.reload();
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Saved player IDs" subtitle="Saved IDs appear as one-click options at checkout." />
      <form onSubmit={submit} className="card grid gap-3 p-5 sm:grid-cols-[1fr_1fr_120px_1fr_auto] sm:items-end">
        <Field label="Game">
          <select className="input" required value={form.gameId} onChange={(e) => setForm({ ...form, gameId: e.target.value })}>
            <option value="">Select…</option>
            {games.data?.games.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Player ID">
          <input className="input" required value={form.playerId} onChange={(e) => setForm({ ...form, playerId: e.target.value.trim() })} />
        </Field>
        <Field label="Server">
          <input className="input" value={form.serverId} onChange={(e) => setForm({ ...form, serverId: e.target.value.trim() })} placeholder="If needed" />
        </Field>
        <Field label="Label">
          <input className="input" value={form.label} maxLength={40} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Main account" />
        </Field>
        <button className="btn-primary" disabled={add.pending}>
          {add.pending && <Spinner />} Save
        </button>
      </form>
      <ErrorBox message={add.error ?? remove.error ?? players.error} />
      {players.loading && !players.data ? (
        <Loading />
      ) : !players.data?.players.length ? (
        <EmptyState title="No saved players" />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {players.data.players.map((p) => (
            <li key={p.id} className="card flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-medium">{p.label || p.nickname || p.playerId}</p>
                <p className="truncate text-xs text-muted">
                  {p.game.name} · {p.game.playerIdLabel} {p.playerId}
                  {p.serverId && ` (${p.serverId})`}
                </p>
              </div>
              <div className="flex gap-2">
                <Link href={`/games/${p.game.slug}`} className="btn-secondary px-3 py-1.5 text-xs">
                  Top up
                </Link>
                <button
                  className="btn-danger px-3 py-1.5 text-xs"
                  onClick={async () => {
                    await remove.run(() => api(`/account/saved-players/${p.id}`, { method: 'DELETE' }));
                    await players.reload();
                  }}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
