'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { ErrorBox, Field, Loading, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction } from '@/lib/hooks';
import { safeNext } from '@/lib/nav';
import type { User } from '@/lib/types';

function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const { setUser } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { pending, error, run } = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const res = await run(() => api<{ user: User }>('/auth/login', { method: 'POST', body: { email, password } }));
    if (res) {
      setUser(res.user);
      router.push(next);
    }
  }

  return (
    <AuthShell
      eyebrow="Sign in"
      title={
        <>
          Welcome
          <br />
          back.
        </>
      }
      aside={
        <>
          <p>Your saved player IDs and order history are waiting.</p>
          <div className="mt-8 border-t border-dashed border-ink/25 pt-4 font-mono text-xs leading-6">
            <p className="text-muted">Demo accounts</p>
            <p>customer@donat.local · Customer-2026</p>
            <p>admin@donat.local · ChangeMe-Admin-2026</p>
          </div>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        <Field label="Email">
          <input className="input h-11" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <div>
          <div className="flex items-baseline justify-between">
            <span className="label">Password</span>
            <Link href="/forgot-password" className="text-xs text-muted hover:text-text">
              Forgot it?
            </Link>
          </div>
          <input
            className="input h-11"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label="Password"
          />
        </div>
        <ErrorBox message={error} />
        <button className="btn-primary h-11 w-full" disabled={pending}>
          {pending && <Spinner />} Sign in
        </button>
        <p className="text-center text-sm text-muted">
          New here?{' '}
          <Link href={`/register?next=${encodeURIComponent(next)}`} className="link text-text">
            Create an account
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Loading />}>
      <LoginForm />
    </Suspense>
  );
}
