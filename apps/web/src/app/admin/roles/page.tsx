'use client';

import { useState } from 'react';
import { ErrorBox, Loading, PageHeader, Spinner, SuccessBox } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useApi } from '@/lib/hooks';

interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  _count: { users: number };
}

export default function RolesPage() {
  const { can } = useAuth();
  const canWrite = can('roles:write');
  const { data, error, loading, reload } = useApi<{ roles: Role[]; permissions: string[] }>('/admin/roles');
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [newRole, setNewRole] = useState('');
  const [message, setMessage] = useState<string>();
  const action = useAction();

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error} />;

  const permsFor = (r: Role) => draft[r.id] ?? r.permissions;
  const toggle = (r: Role, p: string) => {
    const cur = permsFor(r);
    setDraft({ ...draft, [r.id]: cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p] });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles & permissions"
        subtitle="Permissions are enforced by the API on every request. SUPER_ADMIN cannot be edited."
        actions={
          canWrite && (
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await action.run(() => api('/admin/roles', { method: 'POST', body: { name: newRole, permissions: ['admin:access'] } }));
                if (ok) {
                  setNewRole('');
                  await reload();
                }
              }}
            >
              <input className="input w-48 uppercase" placeholder="NEW_ROLE" pattern="[A-Za-z][A-Za-z0-9_]{2,30}" required value={newRole} onChange={(e) => setNewRole(e.target.value.toUpperCase())} />
              <button className="btn-primary">Add role</button>
            </form>
          )
        }
      />
      <SuccessBox message={message} />
      <ErrorBox message={action.error} />
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Permission</th>
              {data.roles.map((r) => (
                <th key={r.id} className="text-center">
                  {r.name}
                  <p className="font-normal normal-case">{r._count.users} users</p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.permissions.map((p) => (
              <tr key={p}>
                <td className="font-mono text-xs">{p}</td>
                {data.roles.map((r) => (
                  <td key={r.id} className="text-center">
                    <input
                      type="checkbox"
                      aria-label={`${r.name} ${p}`}
                      checked={permsFor(r).includes(p)}
                      disabled={!canWrite || r.name === 'SUPER_ADMIN'}
                      onChange={() => toggle(r, p)}
                    />
                  </td>
                ))}
              </tr>
            ))}
            {canWrite && (
              <tr>
                <td />
                {data.roles.map((r) => (
                  <td key={r.id} className="text-center">
                    {draft[r.id] && (
                      <button
                        className="btn-primary px-2 py-1 text-xs"
                        disabled={action.pending}
                        onClick={async () => {
                          setMessage(undefined);
                          const ok = await action.run(() => api(`/admin/roles/${r.id}`, { method: 'PATCH', body: { permissions: draft[r.id] } }));
                          if (ok) {
                            const { [r.id]: _, ...rest } = draft;
                            setDraft(rest);
                            setMessage(`${r.name} updated.`);
                            await reload();
                          }
                        }}
                      >
                        {action.pending && <Spinner />} Save
                      </button>
                    )}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
