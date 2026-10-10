'use client';

import { CATALOG_CATEGORIES, CATEGORY_LABELS, type CatalogCategory } from '@donat/shared';
import { useState, type FormEvent } from 'react';
import { ErrorBox, Field, Spinner } from './ui';
import { useAction } from '@/lib/hooks';

export interface GameFormValues {
  slug: string;
  name: string;
  publisher: string;
  category: CatalogCategory;
  description: string;
  currencyName: string;
  playerIdLabel: string;
  playerIdPattern: string;
  playerIdHelp: string;
  requiresServer: boolean;
  servers: string;
  isActive: boolean;
  sortOrder: number;
}

export const EMPTY_GAME: GameFormValues = {
  slug: '',
  name: '',
  publisher: '',
  category: 'games',
  description: '',
  currencyName: 'Credits',
  playerIdLabel: 'Player ID',
  playerIdPattern: '^[0-9]{5,15}$',
  playerIdHelp: '',
  requiresServer: false,
  servers: '',
  isActive: true,
  sortOrder: 0,
};

export function toGamePayload(v: GameFormValues) {
  return {
    ...v,
    publisher: v.publisher || null,
    description: v.description || null,
    playerIdHelp: v.playerIdHelp || null,
    servers: v.servers
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    sortOrder: Number(v.sortOrder) || 0,
  };
}

export function GameForm({ initial, submitLabel, onSubmit }: { initial: GameFormValues; submitLabel: string; onSubmit: (v: GameFormValues) => Promise<unknown> }) {
  const [v, setV] = useState(initial);
  const { pending, error, run } = useAction();
  const set = <K extends keyof GameFormValues>(k: K, val: GameFormValues[K]) => setV({ ...v, [k]: val });

  async function submit(e: FormEvent) {
    e.preventDefault();
    await run(() => onSubmit(v));
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <input className="input" required value={v.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Slug (URL)" hint="lowercase-with-dashes">
          <input className="input" required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={v.slug} onChange={(e) => set('slug', e.target.value.toLowerCase())} />
        </Field>
        <Field label="Publisher / label">
          <input className="input" value={v.publisher} onChange={(e) => set('publisher', e.target.value)} />
        </Field>
        <Field label="Store section">
          <select className="input" value={v.category} onChange={(e) => set('category', e.target.value as CatalogCategory)}>
            {CATALOG_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c].title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Currency / unit name" hint="UC, Diamonds, Stars, months, so‘m…">
          <input className="input" required value={v.currencyName} onChange={(e) => set('currencyName', e.target.value)} />
        </Field>
        <Field label="Player ID label">
          <input className="input" required value={v.playerIdLabel} onChange={(e) => set('playerIdLabel', e.target.value)} />
        </Field>
        <Field label="Player ID pattern (regex)" hint="Validated on the server before any supplier call.">
          <input className="input font-mono" required value={v.playerIdPattern} onChange={(e) => set('playerIdPattern', e.target.value)} />
        </Field>
        <Field label="Servers (comma separated)" hint="Leave empty to accept any server/zone ID.">
          <input className="input" value={v.servers} onChange={(e) => set('servers', e.target.value)} disabled={!v.requiresServer} />
        </Field>
        <Field label="Sort order">
          <input className="input" type="number" min={0} value={v.sortOrder} onChange={(e) => set('sortOrder', Number(e.target.value))} />
        </Field>
      </div>
      <Field label="Description">
        <textarea className="input min-h-20" value={v.description} onChange={(e) => set('description', e.target.value)} maxLength={2000} />
      </Field>
      <Field label="Player ID help text">
        <input className="input" value={v.playerIdHelp} onChange={(e) => set('playerIdHelp', e.target.value)} maxLength={300} />
      </Field>
      <div className="flex flex-wrap gap-6 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={v.requiresServer} onChange={(e) => set('requiresServer', e.target.checked)} /> Requires server / zone
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={v.isActive} onChange={(e) => set('isActive', e.target.checked)} /> Enabled (visible in store)
        </label>
      </div>
      <ErrorBox message={error} />
      <button className="btn-primary" disabled={pending}>
        {pending && <Spinner />} {submitLabel}
      </button>
    </form>
  );
}
