'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { ErrorBox, Field, Loading, Spinner, SuccessBox } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';

function ResetForm() {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const { pending, error, run } = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const res = await run(() => api('/auth/password/reset', { method: 'POST', body: { token, newPassword: password } }));
    if (res) setDone(true);
  }

  return (
    <AuthShell eyebrow="Password reset" title="Pick a new password." aside={<p>After this, every device signed in to your account will be signed out.</p>}>
      {!token ? (
        <ErrorBox message="This reset link is incomplete. Request a new one." />
      ) : done ? (
        <div className="space-y-5">
          <SuccessBox message="Password changed. You can sign in with it now." />
          <Link href="/login" className="btn-primary h-11 w-full">
            Sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <Field label="New password" hint="At least 10 characters, letters and numbers.">
            <input className="input h-11" type="password" required minLength={10} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <ErrorBox message={error} />
          <button className="btn-primary h-11 w-full" disabled={pending}>
            {pending && <Spinner />} Save password
          </button>
        </form>
      )}
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ResetForm />
    </Suspense>
  );
}
