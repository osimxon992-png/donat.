import { describe, expect, it } from 'vitest';
import {
  applyBps,
  decimalStringToMinor,
  formatMoney,
  marginBps,
  minorToDecimalString,
  priceFromMarkup,
  sumMinor,
} from './money';
import { canTransition, ORDER_STATUSES, ORDER_TRANSITIONS } from './order-state';

describe('money', () => {
  it('applies basis points with explicit rounding', () => {
    expect(applyBps(1000, 1500)).toBe(150);
    expect(applyBps(999, 1000, 'half-up')).toBe(100);
    expect(applyBps(999, 1000, 'floor')).toBe(99);
    expect(applyBps(1, 5000, 'half-up')).toBe(1);
  });

  it('keeps integer arithmetic exact', () => {
    expect(sumMinor([10, 20])).toBe(30);
    expect(minorToDecimalString(30, 'USD')).toBe('0.30');
  });

  it('computes price from markup and margin', () => {
    expect(priceFromMarkup(1000, 2000)).toBe(1200);
    expect(priceFromMarkup(333, 1000)).toBe(367);
    expect(marginBps(1200, 1000)).toBe(1666);
    expect(marginBps(0, 0)).toBe(0);
  });

  it('parses and formats decimal strings', () => {
    expect(decimalStringToMinor('12.34', 'USD')).toBe(1234);
    expect(decimalStringToMinor('12', 'USD')).toBe(1200);
    expect(decimalStringToMinor('12.5', 'USD')).toBe(1250);
    expect(decimalStringToMinor('1500', 'JPY')).toBe(1500);
    expect(() => decimalStringToMinor('1.234', 'USD')).toThrow();
    expect(() => decimalStringToMinor('abc', 'USD')).toThrow();
    expect(minorToDecimalString(-5, 'USD')).toBe('-0.05');
    expect(formatMoney(123456, 'USD')).toBe('$1,234.56');
  });

  it('rejects non-integer amounts', () => {
    expect(() => applyBps(1.5, 100)).toThrow();
    expect(() => sumMinor([0.1, 0.2])).toThrow();
  });
});

describe('order state machine', () => {
  it('defines transitions for every status', () => {
    for (const s of ORDER_STATUSES) expect(ORDER_TRANSITIONS[s]).toBeDefined();
  });

  it('allows the happy path and blocks invalid jumps', () => {
    expect(canTransition('CREATED', 'AWAITING_PAYMENT')).toBe(true);
    expect(canTransition('AWAITING_PAYMENT', 'PAID')).toBe(true);
    expect(canTransition('PAID', 'QUEUED')).toBe(true);
    expect(canTransition('QUEUED', 'PROCESSING')).toBe(true);
    expect(canTransition('PROCESSING', 'FULFILLED')).toBe(true);
    expect(canTransition('AWAITING_PAYMENT', 'FULFILLED')).toBe(false);
    expect(canTransition('CREATED', 'PROCESSING')).toBe(false);
    expect(canTransition('FULFILLED', 'REFUNDED')).toBe(false);
    expect(canTransition('REFUNDED', 'QUEUED')).toBe(false);
    expect(canTransition('CANCELLED', 'PAID')).toBe(false);
  });
});
