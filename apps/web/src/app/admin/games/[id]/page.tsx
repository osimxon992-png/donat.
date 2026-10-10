'use client';

import { decimalStringToMinor } from '@donat/shared';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { GameArt } from '@/components/game-art';
import { GameForm, toGamePayload, type GameFormValues } from '@/components/game-form';
import { ErrorBox, Field, Loading, PageHeader, Spinner, StatusBadge, SuccessBox } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money } from '@/lib/format';
import { useAction, useApi } from '@/lib/hooks';

interface AdminProduct {
  id: string;
  sku: string;
  name: string;
  amount: number;
  bonusAmount: number;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
  prices: { priceMinor: number; costMinor: number; currency: string }[];
  providerProducts: { providerSku: string; costMinor: number; provider: { code: string; name: string } }[];
}

interface GameResponse {
  game: GameFormValues & { id: string; imageUrl: string | null; servers: string[]; products: AdminProduct[] };
}

const EMPTY_PRODUCT = { sku: '', name: '', amount: '', bonusAmount: '0', cost: '', price: '', isFeatured: false };

export default function AdminGamePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAuth();
  const { data, error, loading, reload } = useApi<GameResponse>(`/admin/games/${id}`);
  const [saved, setSaved] = useState<string>();
  const upload = useAction();
  const productAction = useAction();
  const fileRef = useRef<HTMLInputElement>(null);
  const [newProduct, setNewProduct] = useState(EMPTY_PRODUCT);
  const [editing, setEditing] = useState<string>();
  const [editValues, setEditValues] = useState({ name: '', amount: '', bonusAmount: '', sortOrder: '' });
  const canWrite = can('games:write');

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error} />;
  const g = data.game;
  const currency = g.products[0]?.prices[0]?.currency ?? 'USD';

  async function uploadImage(file: File) {
    const fd = new FormData();
    fd.append('image', file);
    const ok = await upload.run(() => api(`/admin/games/${id}/image`, { method: 'POST', body: fd }));
    if (ok) await reload();
  }

  async function addProduct(e: FormEvent) {
    e.preventDefault();
    const ok = await productAction.run(async () => {
      const price = { currency, costMinor: decimalStringToMinor(newProduct.cost, currency), pricingMode: 'FIXED', priceMinor: decimalStringToMinor(newProduct.price, currency) };
      return api(`/admin/games/${id}/products`, {
        method: 'POST',
        body: {
          sku: newProduct.sku,
          name: newProduct.name,
          amount: Number(newProduct.amount),
          bonusAmount: Number(newProduct.bonusAmount) || 0,
          isFeatured: newProduct.isFeatured,
          price,
        },
      });
    });
    if (ok) {
      setNewProduct(EMPTY_PRODUCT);
      await reload();
    }
  }

  async function saveProduct(p: AdminProduct) {
    const ok = await productAction.run(() =>
      api(`/admin/products/${p.id}`, {
        method: 'PATCH',
        body: {
          name: editValues.name,
          amount: Number(editValues.amount),
          bonusAmount: Number(editValues.bonusAmount) || 0,
          sortOrder: Number(editValues.sortOrder) || 0,
        },
      }),
    );
    if (ok) {
      setEditing(undefined);
      await reload();
    }
  }

  async function patchProduct(p: AdminProduct, body: Record<string, unknown>) {
    const ok = await productAction.run(() => api(`/admin/products/${p.id}`, { method: 'PATCH', body }));
    if (ok) await reload();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={g.name}
        subtitle={<Link href={`/games/${g.slug}`} className="link">View in store →</Link>}
        actions={<StatusBadge status={g.isActive ? 'ACTIVE' : 'CANCELLED'} label={g.isActive ? 'Enabled' : 'Disabled'} />}
      />

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <div className="space-y-3">
          <div className="aspect-[4/5] overflow-hidden rounded-[10px]">
            <GameArt name={g.name} slug={g.slug} imageUrl={g.imageUrl} />
          </div>
          {canWrite && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadImage(f);
                  e.target.value = '';
                }}
              />
              <button className="btn-secondary w-full" disabled={upload.pending} onClick={() => fileRef.current?.click()}>
                {upload.pending && <Spinner />} Upload image
              </button>
              <p className="text-xs text-muted">PNG, JPEG or WebP, up to 2 MB.</p>
              <ErrorBox message={upload.error} />
            </>
          )}
        </div>
        <div className="card p-5">
          <h2 className="mb-4 font-semibold">Game settings</h2>
          <SuccessBox message={saved} />
          <GameForm
            key={g.id + g.name}
            initial={{ ...g, publisher: g.publisher ?? '', description: g.description ?? '', playerIdHelp: g.playerIdHelp ?? '', servers: g.servers.join(', ') }}
            submitLabel="Save changes"
            onSubmit={async (v) => {
              await api(`/admin/games/${id}`, { method: 'PATCH', body: toGamePayload(v) });
              setSaved('Saved.');
              await reload();
            }}
          />
          {canWrite && (
            <div className="mt-6 border-t border-border pt-4">
              <button
                className="btn-danger"
                onClick={async () => {
                  if (!window.confirm(`Remove ${g.name} from the store? Existing orders are kept.`)) return;
                  await api(`/admin/games/${id}`, { method: 'DELETE' });
                  router.push('/admin/games');
                }}
              >
                Remove game
              </button>
            </div>
          )}
        </div>
      </div>

      <section className="card overflow-x-auto p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Packages</h2>
          <Link href="/admin/pricing" className="link text-sm">
            Edit prices →
          </Link>
        </div>
        <ErrorBox message={productAction.error} />
        <table className="table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th className="text-right">Amount</th>
              <th className="text-right">Bonus</th>
              <th className="text-right">Price</th>
              <th className="text-right">Cost</th>
              <th>Suppliers</th>
              <th>Status</th>
              {canWrite && <th />}
            </tr>
          </thead>
          <tbody>
            {g.products.map((p) => {
              const price = p.prices[0];
              const isEditing = editing === p.id;
              return (
                <tr key={p.id}>
                  <td className="font-mono text-xs">{p.sku}</td>
                  <td>{isEditing ? <input className="input py-1" value={editValues.name} onChange={(e) => setEditValues({ ...editValues, name: e.target.value })} /> : p.name}</td>
                  <td className="text-right">
                    {isEditing ? <input className="input w-24 py-1" type="number" value={editValues.amount} onChange={(e) => setEditValues({ ...editValues, amount: e.target.value })} /> : p.amount.toLocaleString()}
                  </td>
                  <td className="text-right">
                    {isEditing ? <input className="input w-20 py-1" type="number" value={editValues.bonusAmount} onChange={(e) => setEditValues({ ...editValues, bonusAmount: e.target.value })} /> : p.bonusAmount.toLocaleString()}
                  </td>
                  <td className="text-right tabular-nums">{price ? money(price.priceMinor, price.currency) : <span className="text-warn">No price</span>}</td>
                  <td className="text-right tabular-nums text-muted">{price ? money(price.costMinor, price.currency) : '—'}</td>
                  <td className="text-xs text-muted">{p.providerProducts.map((m) => m.provider.code).join(', ') || <span className="text-warn">none</span>}</td>
                  <td>
                    <StatusBadge status={p.isActive ? 'ACTIVE' : 'CANCELLED'} label={p.isActive ? 'On sale' : 'Hidden'} />
                  </td>
                  {canWrite && (
                    <td className="whitespace-nowrap text-right">
                      {isEditing ? (
                        <>
                          <button className="btn-primary px-2 py-1 text-xs" onClick={() => saveProduct(p)}>
                            Save
                          </button>
                          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditing(undefined)}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="btn-ghost px-2 py-1 text-xs"
                            onClick={() => {
                              setEditing(p.id);
                              setEditValues({ name: p.name, amount: String(p.amount), bonusAmount: String(p.bonusAmount), sortOrder: String(p.sortOrder) });
                            }}
                          >
                            Edit
                          </button>
                          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => patchProduct(p, { isActive: !p.isActive })}>
                            {p.isActive ? 'Hide' : 'Show'}
                          </button>
                          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => patchProduct(p, { isFeatured: !p.isFeatured })}>
                            {p.isFeatured ? 'Unfeature' : 'Feature'}
                          </button>
                          <button
                            className="btn-ghost px-2 py-1 text-xs text-bad"
                            onClick={async () => {
                              if (!window.confirm(`Remove package ${p.sku}?`)) return;
                              const ok = await productAction.run(() => api(`/admin/products/${p.id}`, { method: 'DELETE' }));
                              if (ok) await reload();
                            }}
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        {canWrite && (
          <form onSubmit={addProduct} className="mt-5 grid gap-3 rounded-[8px] border border-border p-4 sm:grid-cols-4 lg:grid-cols-8 lg:items-end">
            <p className="font-medium sm:col-span-4 lg:col-span-8">Add package</p>
            <Field label="SKU">
              <input className="input" required value={newProduct.sku} onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value.toUpperCase() })} />
            </Field>
            <div className="lg:col-span-2">
              <Field label="Name">
                <input className="input" required value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} />
              </Field>
            </div>
            <Field label="Amount">
              <input className="input" type="number" min={1} required value={newProduct.amount} onChange={(e) => setNewProduct({ ...newProduct, amount: e.target.value })} />
            </Field>
            <Field label="Bonus">
              <input className="input" type="number" min={0} value={newProduct.bonusAmount} onChange={(e) => setNewProduct({ ...newProduct, bonusAmount: e.target.value })} />
            </Field>
            <Field label={`Cost (${currency})`}>
              <input className="input" required inputMode="decimal" pattern="\d+(\.\d{1,2})?" placeholder="4.30" value={newProduct.cost} onChange={(e) => setNewProduct({ ...newProduct, cost: e.target.value })} />
            </Field>
            <Field label={`Price (${currency})`}>
              <input className="input" required inputMode="decimal" pattern="\d+(\.\d{1,2})?" placeholder="4.99" value={newProduct.price} onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })} />
            </Field>
            <button className="btn-primary" disabled={productAction.pending}>
              {productAction.pending && <Spinner />} Add
            </button>
            <p className="text-xs text-muted sm:col-span-4 lg:col-span-8">
              New packages also need a supplier mapping (Providers → product mappings) before they can be delivered.
            </p>
          </form>
        )}
      </section>
    </div>
  );
}
