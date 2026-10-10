'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { TicketThread, type TicketDetail } from '@/components/ticket-thread';
import { ErrorBox, Loading, PageHeader, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';

export default function TicketPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useApi<{ ticket: TicketDetail }>(`/account/tickets/${id}`, 15_000);

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error} />;
  const t = data.ticket;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.subject}
        subtitle={
          t.order ? (
            <Link className="link" href={`/orders/${t.order.id}`}>
              Order {t.order.orderNumber}
            </Link>
          ) : undefined
        }
        actions={
          <>
            <StatusBadge status={t.status} />
            {t.status !== 'CLOSED' && (
              <button
                className="btn-secondary px-3 py-1.5 text-xs"
                onClick={async () => {
                  await api(`/account/tickets/${id}/close`, { method: 'POST' });
                  await reload();
                }}
              >
                Close ticket
              </button>
            )}
          </>
        }
      />
      <div className="card p-5">
        <TicketThread ticket={t} replyPath={`/account/tickets/${id}/messages`} onChange={reload} />
      </div>
    </div>
  );
}
