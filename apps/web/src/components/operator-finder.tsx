'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { GameSummary } from '@/lib/types';

/** Turns "+998 (90) 123-45-67", "90 123 45 67" or "0901234567" into "998901234567". */
export function normalizeUzPhone(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.length === 10 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 9) d = `998${d}`;
  return d;
}

/**
 * "Whose number is this?" — matches a phone number against each mobile operator's
 * number pattern from the catalogue, so the answer always follows what the store sells.
 */
export function OperatorFinder({ operators }: { operators: GameSummary[] }) {
  const [raw, setRaw] = useState('');
  const phone = normalizeUzPhone(raw);
  const complete = /^998[0-9]{9}$/.test(phone);
  const match = complete
    ? operators.find((o) => {
        try {
          return new RegExp(o.playerIdPattern).test(phone);
        } catch {
          return false;
        }
      })
    : undefined;

  return (
    <div className="card p-6">
      <p className="font-display text-3xl tracking-wider uppercase">Which operator is this?</p>
      <p className="mt-1 text-sm font-medium text-muted">Type any Uzbek number in any format — we’ll tell you the operator.</p>
      <input
        className="input mt-4 h-12 text-base"
        inputMode="tel"
        placeholder="+998 90 123 45 67"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        aria-label="Phone number"
      />
      <div className="mt-3 min-h-10 text-sm" aria-live="polite">
        {!raw ? null : !complete ? (
          <p className="text-muted">Keep typing — a full number has 9 digits after 998.</p>
        ) : match ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>
              <span className="font-semibold">{match.name}</span> <span className="text-muted">· +{phone}</span>
            </p>
            <Link href={`/games/${match.slug}`} className="btn-primary">
              Top up {match.name}
            </Link>
          </div>
        ) : (
          <p className="text-warn">We don’t sell balance for this operator yet.</p>
        )}
      </div>
    </div>
  );
}
