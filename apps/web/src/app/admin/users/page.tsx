'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmptyState, ErrorBox, Loading, PageHeader, Pagination, StatusBadge } from '@/components/ui';
import { date, dateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { Paged } from '@/lib/types';

interface UserRow {
  id: string;
  email: string;
  name: string;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
  role: { id: string; name: string };
  _count: { orders: number };
}

export default function UsersPage() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  const { data, error, loading } = useApi<Paged<UserRow>>(`/admin/users?page=${page}&pageSize=25${debounced ? `&q=${encodeURIComponent(debounced)}` : ''}`);

  return (
    <div>
      <PageHeader title="Customers & staff" subtitle={data ? `${data.total} accounts` : undefined} />
      <input className="input mb-4 max-w-sm" placeholder="Search by email or name" value={q} onChange={(e) => setQ(e.target.value)} />
      <ErrorBox message={error} />
      {loading && !data ? (
        <Loading />
      ) : !data?.items.length ? (
        <EmptyState title="No users found" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th className="text-right">Orders</th>
                <th>Joined</th>
                <th>Last login</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link href={`/admin/users/${u.id}`} className="link font-medium">
                      {u.name}
                    </Link>
                    <p className="text-xs text-muted">{u.email}</p>
                  </td>
                  <td className="font-mono text-xs">{u.role.name}</td>
                  <td className="text-right">{u._count.orders}</td>
                  <td>{date(u.createdAt)}</td>
                  <td className="text-muted">{dateTime(u.lastLoginAt)}</td>
                  <td>
                    <StatusBadge status={u.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />}
    </div>
  );
}
