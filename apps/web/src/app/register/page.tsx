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

function RegisterForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const { setUser } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const { pending, error, setError, run } = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setError('The two passwords don’t match.');
      return;
    }
    const res = await run(() =>
      api<{ user: User }>('/auth/register', { method: 'POST', body: { name: form.name, email: form.email, password: form.password } }),
    );
    if (res) {
      setUser(res.user);
      router.push(next);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const longEnough = form.password.length >= 10;
  const mixed = /[a-z]/i.test(form.password) && /\d/.test(form.password);

  return (
    <AuthShell
      eyebrow="Create account"
      title={
        <>
          One account,
          <br />
          every game.
        </>
      }
      aside={<p>Save your player IDs once, reorder in two clicks, and keep receipts for everything you buy.</p>}
    >
      <form onSubmit={submit} className="space-y-5">
        <Field label="Your name">
          <input className="input h-11" required minLength={2} maxLength={80} autoComplete="name" value={form.name} onChange={set('name')} />
        </Field>
        <Field label="Email">
          <input className="input h-11" type="email" required autoComplete="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Password">
          <input className="input h-11" type="password" required minLength={10} autoComplete="new-password" value={form.password} onChange={set('password')} />
        </Field>
        <ul className="-mt-2 space-y-1 font-mono text-[11px]">
          <li className={longEnough ? 'text-ok' : 'text-muted'}>{longEnough ? '✓' : '○'} at least 10 characters</li>
          <li className={mixed ? 'text-ok' : 'text-muted'}>{mixed ? '✓' : '○'} letters and numbers</li>
        </ul>
        <Field label="Repeat password">
          <input className="input h-11" type="password" required autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
        </Field>
        <ErrorBox message={error} />
        <button className="btn-primary h-11 w-full" disabled={pending}>
          {pending && <Spinner />} Create account
        </button>
        <p className="text-center text-sm text-muted">
          Already registered?{' '}
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="link text-text">
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<Loading />}>
      <RegisterForm />
    </Suspense>
  );
}
