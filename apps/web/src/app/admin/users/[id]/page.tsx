'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { DefinitionList, ErrorBox, Field, Loading, PageHeader, StatusBadge, SuccessBox } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime, money } from '@/lib/format';
import { useAction, useApi } from '@/lib/hooks';

interface UserDetail {
  user: {
    id: string;
    email: string;
    name: string;
    phone: string | null;
    status: string;
    createdAt: string;
    lastLoginAt: string | null;
    failedLoginCount: number;
    lockedUntil: string | null;
    role: { id: string; name: string };
    orders: { id: string; orderNumber: string; status: string; totalMinor: number; currency: string; createdAt: string }[];
  };
}

export default function AdminUserPage() {
  const { id } = useParams<{ id: string }>();
  const { user: me, can } = useAuth();
  const { data, error, loading, reload } = useApi<UserDetail>(`/admin/users/${id}`);
  const roles = useApi<{ roles: { id: string; name: string }[] }>('/admin/roles');
  const action = useAction();
  const [message, setMessage] = useState<string>();

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error} />;
  const u = data.user;
  const isSelf = me?.id === u.id;
  const canWrite = can('users:write') && !isSelf;

  async function update(body: Record<string, unknown>, msg: string) {
    setMessage(undefined);
    const ok = await action.run(() => api(`/admin/users/${id}`, { method: 'PATCH', body }));
    if (ok) {
      setMessage(msg);
      await reload();
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={u.name} subtitle={u.email} actions={<StatusBadge status={u.status} />} />
      <SuccessBox message={message} />
      <ErrorBox message={action.error} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <DefinitionList
            items={[
              ['Role', u.role.name],
              ['Phone', u.phone ?? '—'],
              ['Joined', dateTime(u.createdAt)],
              ['Last login', dateTime(u.lastLoginAt)],
              ['Failed logins', String(u.failedLoginCount)],
              ['Locked until', dateTime(u.lockedUntil)],
            ]}
          />
          <Link href={`/admin/audit?actorId=${u.id}`} className="link mt-4 inline-block text-sm">
            View this user’s audit trail →
          </Link>
        </div>
        <div className="card space-y-4 p-5">
          <h2 className="font-semibold">Access</h2>
          {isSelf && <p className="text-sm text-muted">You cannot change your own role or status.</p>}
          <Field label="Role">
            <select className="input" disabled={!canWrite || action.pending} value={u.role.id} onChange={(e) => update({ roleId: e.target.value }, 'Role updated.')}>
              {roles.data?.roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          {canWrite &&
            (u.status === 'ACTIVE' ? (
              <button className="btn-danger" disabled={action.pending} onClick={() => update({ status: 'SUSPENDED' }, 'Account suspended and signed out everywhere.')}>
                Suspend account
              </button>
            ) : (
              <button className="btn-primary" disabled={action.pending} onClick={() => update({ status: 'ACTIVE' }, 'Account reactivated.')}>
                Reactivate account
              </button>
            ))}
        </div>
      </div>
      <section className="card overflow-x-auto p-5">
        <h2 className="mb-3 font-semibold">Recent orders</h2>
        <table className="table">
          <tbody>
            {u.orders.map((o) => (
              <tr key={o.id}>
                <td>
                  <Link href={`/admin/orders/${o.id}`} className="link">
                    {o.orderNumber}
                  </Link>
                </td>
                <td>{dateTime(o.createdAt)}</td>
                <td className="text-right tabular-nums">{money(o.totalMinor, o.currency)}</td>
                <td>
                  <StatusBadge status={o.status} />
                </td>
              </tr>
            ))}
            {u.orders.length === 0 && (
              <tr>
                <td className="text-muted">No orders.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
