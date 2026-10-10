'use client';

import Link from 'next/link';
import { GameArt } from './game-art';
import { StatusBadge } from './ui';
import { date, money } from '@/lib/format';
import type { CustomerOrder } from '@/lib/types';

export function OrderList({ orders }: { orders: CustomerOrder[] }) {
  return (
    <ul className="divide-y divide-ink/10 border-y border-ink/10">
      {orders.map((o) => (
        <li key={o.id}>
          <Link href={`/orders/${o.id}`} className="group flex items-center gap-4 py-4 transition-colors hover:bg-surface/60 sm:px-2">
            <div className="h-11 w-11 shrink-0 overflow-hidden rounded-[6px]">
              <GameArt name={o.game.name} slug={o.game.slug} imageUrl={o.game.imageUrl} variant="thumb" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">
                {o.items[0]?.productName} <span className="font-normal text-muted">· {o.game.name}</span>
              </p>
              <p className="truncate font-mono text-xs text-muted">
                {o.orderNumber} · ID {o.playerId} · {date(o.createdAt)}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <span className="font-mono text-sm font-medium tabular-nums">{money(o.totalMinor, o.currency)}</span>
              <StatusBadge status={o.status} label={o.statusLabel} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
