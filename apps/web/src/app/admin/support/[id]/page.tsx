'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { TicketThread, type TicketDetail } from '@/components/ticket-thread';
import { ErrorBox, Loading, PageHeader, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction, useApi } from '@/lib/hooks';

const STATUSES = ['OPEN', 'AWAITING_SUPPORT', 'AWAITING_CUSTOMER', 'RESOLVED', 'CLOSED'];

export default function AdminTicketPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useApi<{ ticket: TicketDetail }>(`/admin/tickets/${id}`, 15_000);
  const action = useAction();

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error} />;
  const t = data.ticket;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.subject}
        subtitle={
          <>
            <Link href={`/admin/users/${t.user.id}`} className="link">
              {t.user.name} ({t.user.email})
            </Link>
            {t.order && (
              <>
                {' · '}
                <Link href={`/admin/orders/${t.order.id}`} className="link">
                  Order {t.order.orderNumber}
                </Link>{' '}
                <StatusBadge status={t.order.status} />
              </>
            )}
          </>
        }
        actions={
          <select
            className="input w-56"
            value={t.status}
            disabled={action.pending}
            onChange={async (e) => {
              const status = e.target.value;
              const ok = await action.run(() => api(`/admin/tickets/${id}/status`, { method: 'POST', body: { status } }));
              if (ok) await reload();
            }}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replaceAll('_', ' ').toLowerCase()}
              </option>
            ))}
          </select>
        }
      />
      <ErrorBox message={action.error} />
      <div className="card p-5">
        <TicketThread ticket={t} replyPath={`/admin/tickets/${id}/messages`} onChange={reload} />
      </div>
    </div>
  );
}
