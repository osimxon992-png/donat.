'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { ErrorBox, Field, Spinner, SuccessBox } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string>();
  const { pending, error, run } = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const res = await run(() => api<{ message: string }>('/auth/password/forgot', { method: 'POST', body: { email } }));
    if (res) setMessage(res.message);
  }

  return (
    <AuthShell
      eyebrow="Password reset"
      title={
        <>
          Forgot your
          <br />
          password?
        </>
      }
      aside={<p>Enter the email you signed up with and we’ll send a link that works for one hour.</p>}
    >
      <form onSubmit={submit} className="space-y-5">
        <Field label="Email">
          <input className="input h-11" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <ErrorBox message={error} />
        <SuccessBox message={message} />
        <button className="btn-primary h-11 w-full" disabled={pending}>
          {pending && <Spinner />} Send reset link
        </button>
        <p className="text-xs leading-relaxed text-muted">In development, emails are written to the API log instead of being sent.</p>
        <Link href="/login" className="link block text-center text-sm">
          Back to sign in
        </Link>
      </form>
    </AuthShell>
  );
}
