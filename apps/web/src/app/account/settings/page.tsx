'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { ErrorBox, Field, PageHeader, Spinner, SuccessBox } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime } from '@/lib/format';
import { useAction, useApi } from '@/lib/hooks';
import type { User } from '@/lib/types';

interface SessionRow {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

export default function SettingsPage() {
  const { user, setUser } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState({ name: '', phone: '', marketingOptIn: false });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [saved, setSaved] = useState<string>();
  const [pwDone, setPwDone] = useState<string>();
  const saveProfile = useAction();
  const changePw = useAction();
  const sessions = useApi<{ sessions: SessionRow[] }>('/auth/sessions');

  useEffect(() => {
    if (user) setProfile({ name: user.name, phone: user.phone ?? '', marketingOptIn: user.marketingOptIn });
  }, [user]);

  async function submitProfile(e: FormEvent) {
    e.preventDefault();
    setSaved(undefined);
    const res = await saveProfile.run(() => api<{ user: User }>('/account/profile', { method: 'PATCH', body: profile }));
    if (res) {
      setUser(res.user);
      setSaved('Profile saved.');
    }
  }

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    setPwDone(undefined);
    if (pw.newPassword !== pw.confirm) {
      changePw.setError('New passwords do not match');
      return;
    }
    const ok = await changePw.run(() =>
      api('/auth/password/change', { method: 'POST', body: { currentPassword: pw.currentPassword, newPassword: pw.newPassword } }),
    );
    if (ok) {
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      setPwDone('Password changed. Other devices were signed out.');
      await sessions.reload();
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Account settings" />

      <form onSubmit={submitProfile} className="card space-y-4 p-5">
        <h2 className="font-semibold">Profile</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input className="input" required minLength={2} maxLength={80} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
          </Field>
          <Field label="Email">
            <input className="input opacity-60" value={user?.email ?? ''} disabled />
          </Field>
          <Field label="Phone">
            <input className="input" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} placeholder="+998 90 123 45 67" />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={profile.marketingOptIn} onChange={(e) => setProfile({ ...profile, marketingOptIn: e.target.checked })} />
          Email me about promotions
        </label>
        <ErrorBox message={saveProfile.error} />
        <SuccessBox message={saved} />
        <button className="btn-primary" disabled={saveProfile.pending}>
          {saveProfile.pending && <Spinner />} Save profile
        </button>
      </form>

      <form onSubmit={submitPassword} className="card space-y-4 p-5">
        <h2 className="font-semibold">Password</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Current password">
            <input className="input" type="password" required autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
          </Field>
          <Field label="New password">
            <input className="input" type="password" required minLength={10} autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
          </Field>
          <Field label="Confirm new password">
            <input className="input" type="password" required autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          </Field>
        </div>
        <ErrorBox message={changePw.error} />
        <SuccessBox message={pwDone} />
        <button className="btn-primary" disabled={changePw.pending}>
          {changePw.pending && <Spinner />} Change password
        </button>
      </form>

      <div className="card space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Active sessions</h2>
          <button
            className="btn-danger px-3 py-1.5 text-xs"
            onClick={async () => {
              await api('/auth/logout-all', { method: 'POST' });
              setUser(null);
              router.push('/login');
            }}
          >
            Sign out everywhere
          </button>
        </div>
        <ul className="divide-y divide-border text-sm">
          {sessions.data?.sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate text-muted">{s.userAgent ?? 'Unknown device'}</span>
              <span className="shrink-0 text-xs text-muted">
                {s.current ? <span className="text-ok">This device</span> : `last used ${dateTime(s.lastUsedAt)}`}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
