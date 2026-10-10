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
    <div className="flex items-center gap-3 py-16 font-mono text-xs tracking-wide text-muted uppercase">
      <Spinner /> {label}…
    </div>
  );
}

export function ErrorBox({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="border-l-2 border-bad bg-bad/[0.06] px-4 py-3 text-sm text-bad">
      {message}
    </div>
  );
}

export function SuccessBox({ message }: { message?: string }) {
  if (!message) return null;
  return <div className="border-l-2 border-ok bg-ok/[0.07] px-4 py-3 text-sm text-ok">{message}</div>;
}

export function Notice({ children, tone = 'warn' }: { children: ReactNode; tone?: 'warn' | 'info' }) {
  const cls = tone === 'warn' ? 'border-warn bg-warn/[0.07] text-warn' : 'border-info bg-info/[0.06] text-info';
  return <div className={`border-l-2 px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-dashed border-ink/25 px-6 py-14 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-ink/10 pb-5">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-3xl leading-tight font-bold">{title}</h1>
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
  ok: { text: 'text-ok', dot: 'bg-ok' },
  info: { text: 'text-info', dot: 'bg-info' },
  warn: { text: 'text-warn', dot: 'bg-warn' },
  bad: { text: 'text-bad', dot: 'bg-bad' },
  muted: { text: 'text-muted', dot: 'bg-muted/60' },
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const tone = TONE[STATUS_TONE[status] ?? 'muted']!;
  const live = status === 'PROCESSING' || status === 'QUEUED';
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[11px] font-medium tracking-wide whitespace-nowrap uppercase ${tone.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot} ${live ? 'animate-pulse' : ''}`} />
      {label ?? status.replaceAll('_', ' ').toLowerCase()}
    </span>
  );
}

export function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-5 flex items-center justify-between text-sm">
      <span className="font-mono text-xs text-muted">
        {String(page).padStart(2, '0')} / {String(totalPages).padStart(2, '0')}
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
    <div className="card px-4 py-4">
      <p className="eyebrow">{label}</p>
      <p className={`mt-3 font-display text-[28px] leading-none font-bold tracking-tight tabular-nums ${color}`}>{value}</p>
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
