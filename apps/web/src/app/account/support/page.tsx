'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { EmptyState, ErrorBox, Field, Loading, PageHeader, Spinner, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { relative } from '@/lib/format';
import { useAction, useApi } from '@/lib/hooks';
import type { CustomerOrder, Paged } from '@/lib/types';

interface Ticket {
  id: string;
  subject: string;
  status: string;
  updatedAt: string;
  order: { orderNumber: string } | null;
  _count: { messages: number };
}

function SupportInner() {
  const prefillOrder = useSearchParams().get('order') ?? '';
  const tickets = useApi<{ tickets: Ticket[] }>('/account/tickets');
  const orders = useApi<Paged<CustomerOrder>>('/orders?pageSize=50');
  const [showForm, setShowForm] = useState(!!prefillOrder);
  const [form, setForm] = useState({ subject: '', message: '', orderId: prefillOrder });
  const create = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await create.run(() =>
      api('/account/tickets', { method: 'POST', body: { ...form, orderId: form.orderId || undefined } }),
    );
    if (ok) {
      setForm({ subject: '', message: '', orderId: '' });
      setShowForm(false);
      await tickets.reload();
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support"
        subtitle="Questions about an order? Our team replies here."
        actions={
          <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Close' : 'New ticket'}
          </button>
        }
      />
      {showForm && (
        <form onSubmit={submit} className="card space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Subject">
              <input className="input" required minLength={3} maxLength={120} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </Field>
            <Field label="Related order (optional)">
              <select className="input" value={form.orderId} onChange={(e) => setForm({ ...form, orderId: e.target.value })}>
                <option value="">None</option>
                {orders.data?.items.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.orderNumber} — {o.items[0]?.productName}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Message">
            <textarea className="input min-h-32" required minLength={5} maxLength={5000} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          </Field>
          <ErrorBox message={create.error} />
          <button className="btn-primary" disabled={create.pending}>
            {create.pending && <Spinner />} Send
          </button>
        </form>
      )}
      <ErrorBox message={tickets.error} />
      {tickets.loading && !tickets.data ? (
        <Loading />
      ) : !tickets.data?.tickets.length ? (
        <EmptyState title="No tickets yet" />
      ) : (
        <ul className="space-y-2">
          {tickets.data.tickets.map((t) => (
            <li key={t.id}>
              <Link href={`/account/support/${t.id}`} className="card flex items-center justify-between gap-3 p-4 hover:border-muted">
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.subject}</p>
                  <p className="text-xs text-muted">
                    {t.order ? `Order ${t.order.orderNumber} · ` : ''}
                    {t._count.messages} messages · updated {relative(t.updatedAt)}
                  </p>
                </div>
                <StatusBadge status={t.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function SupportPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SupportInner />
    </Suspense>
  );
}
