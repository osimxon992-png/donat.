'use client';

import Link from 'next/link';
import { EmptyState, ErrorBox, Loading, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { relative } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { NotificationItem } from '@/lib/types';

export default function NotificationsPage() {
  const { data, error, loading, reload } = useApi<{ items: NotificationItem[]; unread: number }>('/account/notifications');

  async function markRead(id: string) {
    await api(`/account/notifications/${id}/read`, { method: 'POST' });
    await reload();
  }

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={data ? `${data.unread} unread` : undefined}
        actions={
          !!data?.unread && (
            <button
              className="btn-secondary"
              onClick={async () => {
                await api('/account/notifications/read-all', { method: 'POST' });
                await reload();
              }}
            >
              Mark all as read
            </button>
          )
        }
      />
      <ErrorBox message={error} />
      {loading && !data ? (
        <Loading />
      ) : !data?.items.length ? (
        <EmptyState title="You're all caught up" />
      ) : (
        <ul className="space-y-2">
          {data.items.map((n) => (
            <li key={n.id} className={`card flex items-start gap-3 p-4 ${n.readAt ? 'opacity-70' : ''}`}>
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? 'bg-border' : 'bg-accent'}`} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{n.title}</p>
                <p className="text-sm text-muted">{n.body}</p>
                <p className="mt-1 text-xs text-muted">{relative(n.createdAt)}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                {n.link && (
                  <Link href={n.link} className="btn-secondary px-3 py-1.5 text-xs" onClick={() => !n.readAt && void markRead(n.id)}>
                    Open
                  </Link>
                )}
                {!n.readAt && (
                  <button className="btn-ghost px-2 py-1.5 text-xs" onClick={() => markRead(n.id)}>
                    Mark read
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
