import type { ReactNode } from 'react';

/** A summary line: label on the left, value on the right. */
export function ReceiptRow({ label, value, strong }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 text-sm ${strong ? 'font-semibold' : ''}`}>
      <span className="shrink-0 text-muted">{label}</span>
      <span className="min-w-0 truncate text-right">{value}</span>
    </div>
  );
}
