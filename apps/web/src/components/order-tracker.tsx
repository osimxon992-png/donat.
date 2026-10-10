'use client';

import { ORDER_PROGRESS_STEPS, type OrderStatus } from '@donat/shared';
import { dateTime } from '@/lib/format';

const HALTED: OrderStatus[] = ['FAILED', 'CANCELLED', 'REFUNDED', 'REFUND_PENDING'];

/** Vertical progress tracker; each reached step shows when it happened. */
export function OrderTracker({ status, timeline }: { status: OrderStatus; timeline: { status: OrderStatus; at: string }[] }) {
  const reachedIndex = ORDER_PROGRESS_STEPS.findIndex((s) => s.statuses.includes(status));
  const current = status === 'FULFILLED' ? ORDER_PROGRESS_STEPS.length - 1 : reachedIndex;
  const halted = HALTED.includes(status);
  const timeFor = (statuses: readonly OrderStatus[]) => timeline.find((t) => statuses.includes(t.status))?.at;

  return (
    <ol className="relative">
      {ORDER_PROGRESS_STEPS.map((step, i) => {
        const done = !halted && (i < current || status === 'FULFILLED');
        const active = !halted && i === current && status !== 'FULFILLED';
        const at = done || active ? timeFor(step.statuses) : undefined;
        const last = i === ORDER_PROGRESS_STEPS.length - 1;
        return (
          <li key={step.key} className="relative flex gap-4 pb-6 last:pb-0">
            {!last && <span className={`absolute top-6 left-[11px] h-[calc(100%-24px)] w-px ${done ? 'bg-ink' : 'bg-ink/20'}`} />}
            <span
              className={`relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] ${
                done ? 'border-ink bg-ok text-white' : active ? 'border-ink bg-pop' : 'border-ink/30 bg-white text-muted'
              }`}
            >
              {done ? '✓' : active ? <span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> : null}
            </span>
            <div className="-mt-0.5 flex flex-1 items-baseline justify-between gap-4">
              <span className={`text-[15px] ${done || active ? 'font-semibold text-text' : 'text-muted'}`}>{step.label}</span>
              {at && <span className="text-xs text-muted">{dateTime(at)}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
