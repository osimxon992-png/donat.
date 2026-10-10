'use client';

import type { ReactNode } from 'react';

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-current border-r-transparent ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-muted">
      <Spinner className="text-accent" /> {label}…
    </div>
  );
}

export function ErrorBox({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-lg border-[3px] border-ink bg-[#ffe1de] px-4 py-3 text-sm font-semibold text-bad shadow-comic-sm">
      {message}
    </div>
  );
}

export function SuccessBox({ message }: { message?: string }) {
  if (!message) return null;
  return <div className="rounded-xl border border-ok/25 bg-ok/10 px-4 py-3 text-sm text-ok">{message}</div>;
}

export function Notice({ children, tone = 'warn' }: { children: ReactNode; tone?: 'warn' | 'info' }) {
  const cls = tone === 'warn' ? 'border-warn/25 bg-warn/10 text-warn' : 'border-info/25 bg-info/10 text-info';
  return <div className={`rounded-xl border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card px-6 py-14 text-center">
      <p className="font-display text-3xl tracking-wider uppercase">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h1 className="text-4xl tracking-wider uppercase sm:text-5xl">{title}</h1>
        {subtitle && <div className="mt-1.5 text-sm text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const STATUS_TONE: Record<string, 'ok' | 'info' | 'warn' | 'bad' | 'muted'> = {
  FULFILLED: 'ok',
  SUCCEEDED: 'ok',
  ACTIVE: 'ok',
  HEALTHY: 'ok',
  PROCESSED: 'ok',
  RESOLVED: 'ok',
  REFUNDED: 'muted',
  PAID: 'info',
  QUEUED: 'info',
  PROCESSING: 'info',
  AWAITING_CUSTOMER: 'info',
  AWAITING_PAYMENT: 'warn',
  PENDING: 'warn',
  CREATED: 'warn',
  MANUAL_REVIEW: 'warn',
  REFUND_PENDING: 'warn',
  DEGRADED: 'warn',
  UNKNOWN: 'warn',
  OPEN: 'warn',
  AWAITING_SUPPORT: 'warn',
  IGNORED: 'muted',
  FAILED: 'bad',
  DOWN: 'bad',
  SUSPENDED: 'bad',
  CANCELLED: 'muted',
  EXPIRED: 'muted',
  CLOSED: 'muted',
};

const TONE: Record<string, { text: string; dot: string }> = {
  ok: { text: 'bg-ok/12 text-ok', dot: 'bg-ok' },
  info: { text: 'bg-info/12 text-info', dot: 'bg-info' },
  warn: { text: 'bg-warn/12 text-warn', dot: 'bg-warn' },
  bad: { text: 'bg-bad/12 text-bad', dot: 'bg-bad' },
  muted: { text: 'bg-ink/8 text-muted', dot: 'bg-muted/60' },
};

const sentence = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const tone = TONE[STATUS_TONE[status] ?? 'muted']!;
  const live = status === 'PROCESSING' || status === 'QUEUED';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${tone.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot} ${live ? 'animate-pulse' : ''}`} />
      {label ?? sentence(status.replaceAll('_', ' '))}
    </span>
  );
}

export function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-5 flex items-center justify-between text-sm">
      <span className="text-sm text-muted">
        Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        <button className="btn-secondary h-9" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          ← Prev
        </button>
        <button className="btn-secondary h-9" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Next →
        </button>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-relaxed text-muted">{hint}</span>}
    </label>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : 'text-text';
  return (
    <div className="card px-5 py-5">
      <p className="text-sm font-bold text-muted">{label}</p>
      <p className={`mt-2 font-display text-4xl leading-none tracking-wide tabular-nums ${color}`}>{value}</p>
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function DefinitionList({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-border text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-6 py-2.5">
          <dt className="shrink-0 text-muted">{k}</dt>
          <dd className="min-w-0 text-right break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
