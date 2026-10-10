'use client';

import Link from 'next/link';
import { GameArt } from './game-art';
import { StatusBadge } from './ui';
import { date, money } from '@/lib/format';
import type { CustomerOrder } from '@/lib/types';

export function OrderList({ orders }: { orders: CustomerOrder[] }) {
  return (
    <ul className="space-y-2">
      {orders.map((o) => (
        <li key={o.id}>
          <Link href={`/orders/${o.id}`} className="card group flex items-center gap-4 p-3 transition-all hover:-translate-y-0.5 hover:bg-pop/20 sm:p-4">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md border-[2.5px] border-ink">
              <GameArt name={o.game.name} slug={o.game.slug} imageUrl={o.game.imageUrl} variant="thumb" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">
                {o.items[0]?.productName} <span className="font-normal text-muted">· {o.game.name}</span>
              </p>
              <p className="truncate text-xs text-muted">
                {o.orderNumber} · ID {o.playerId} · {date(o.createdAt)}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <span className="font-display text-xl tracking-wide tabular-nums">{money(o.totalMinor, o.currency)}</span>
              <StatusBadge status={o.status} label={o.statusLabel} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
