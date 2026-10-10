/**
 * Money helpers. All amounts are integer *minor units* (e.g. cents, tiyin).
 * Arithmetic that can involve multiplication or division is done with BigInt so
 * no JavaScript floating point ever touches a financial amount.
 */

export const CURRENCY_DECIMALS: Readonly<Record<string, number>> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  UZS: 2,
  RUB: 2,
  KZT: 2,
  TRY: 2,
  JPY: 0,
  KRW: 0,
};

export function currencyDecimals(currency: string): number {
  return CURRENCY_DECIMALS[currency.toUpperCase()] ?? 2;
}

export class MoneyError extends Error {}

export function assertMinorUnits(value: unknown, label = 'amount'): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} must be a safe integer number of minor units`);
  }
}

function toSafeNumber(v: bigint): number {
  if (v > BigInt(Number.MAX_SAFE_INTEGER) || v < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new MoneyError('amount out of safe integer range');
  }
  return Number(v);
}

/** Sum of integer minor-unit amounts (throws if any input or the result is unsafe). */
export function sumMinor(values: readonly number[]): number {
  let total = 0n;
  for (const v of values) {
    assertMinorUnits(v);
    total += BigInt(v);
  }
  return toSafeNumber(total);
}

export type Rounding = 'floor' | 'ceil' | 'half-up';

/** Divide two BigInts with explicit rounding (denominator must be positive). */
function divRound(numerator: bigint, denominator: bigint, rounding: Rounding): bigint {
  if (denominator <= 0n) throw new MoneyError('denominator must be positive');
  const q = numerator / denominator; // truncates toward zero
  const r = numerator % denominator;
  if (r === 0n) return q;
  const negative = numerator < 0n;
  switch (rounding) {
    case 'floor':
      return negative ? q - 1n : q;
    case 'ceil':
      return negative ? q : q + 1n;
    case 'half-up': {
      const twice = (r < 0n ? -r : r) * 2n;
      if (twice >= denominator) return negative ? q - 1n : q + 1n;
      return q;
    }
  }
}

/**
 * Apply a basis-point rate (1 bps = 0.01%) to an amount.
 * e.g. applyBps(1000, 1500) === 150  (15% of 10.00 is 1.50)
 */
export function applyBps(amountMinor: number, bps: number, rounding: Rounding = 'half-up'): number {
  assertMinorUnits(amountMinor);
  if (!Number.isInteger(bps)) throw new MoneyError('bps must be an integer');
  return toSafeNumber(divRound(BigInt(amountMinor) * BigInt(bps), 10_000n, rounding));
}

/** Price from cost with a markup in basis points (rounded up so margin is never below target). */
export function priceFromMarkup(costMinor: number, markupBps: number): number {
  assertMinorUnits(costMinor);
  return toSafeNumber(BigInt(costMinor) + BigInt(applyBps(costMinor, markupBps, 'ceil')));
}

/** Margin in basis points: (price - cost) / price. Returns 0 when price is 0. */
export function marginBps(priceMinor: number, costMinor: number): number {
  assertMinorUnits(priceMinor);
  assertMinorUnits(costMinor);
  if (priceMinor === 0) return 0;
  return toSafeNumber(divRound((BigInt(priceMinor) - BigInt(costMinor)) * 10_000n, BigInt(priceMinor), 'floor'));
}

/** Convert integer minor units to a plain decimal string ("1234" USD -> "12.34"). */
export function minorToDecimalString(amountMinor: number, currency: string): string {
  assertMinorUnits(amountMinor);
  const decimals = currencyDecimals(currency);
  const negative = amountMinor < 0;
  const abs = BigInt(Math.abs(amountMinor));
  if (decimals === 0) return `${negative ? '-' : ''}${abs}`;
  const factor = 10n ** BigInt(decimals);
  const whole = abs / factor;
  const frac = (abs % factor).toString().padStart(decimals, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

/** Parse a user-entered decimal string ("12.34") into minor units without floats. */
export function decimalStringToMinor(input: string, currency: string): number {
  const decimals = currencyDecimals(currency);
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(input.trim());
  if (!match) throw new MoneyError(`invalid amount: "${input}"`);
  const sign = match[1];
  const whole = match[2] ?? '0';
  const frac = match[3] ?? '';
  if (frac.length > decimals) throw new MoneyError(`too many decimal places for ${currency}`);
  const minor = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0');
  return toSafeNumber(sign ? -minor : minor);
}

/** Human readable money string, formatted from an exact decimal string (never a float). */
export function formatMoney(amountMinor: number, currency: string, locale = 'en-US'): string {
  const decimals = currencyDecimals(currency);
  const decimal = minorToDecimalString(amountMinor, currency);
  try {
    const fmt = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    // Intl.NumberFormat accepts exact decimal strings (ES2023); older lib typings only declare number.
    return fmt.format(decimal as unknown as number);
  } catch {
    return `${decimal} ${currency}`;
  }
}
