import type { ReactNode } from 'react';

/** A line on a receipt: label …… value, with a dotted leader. */
export function ReceiptRow({ label, value, strong }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-baseline gap-2 font-mono text-[13px] ${strong ? 'font-semibold' : ''}`}>
      <span className="shrink-0 text-muted">{label}</span>
      <span className="flex-1 translate-y-[-3px] border-b border-dotted border-ink/25" />
      <span className="min-w-0 truncate text-right">{value}</span>
    </div>
  );
}
