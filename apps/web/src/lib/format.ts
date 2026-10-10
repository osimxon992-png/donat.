import { formatMoney } from '@donat/shared';

export function money(amountMinor: number | null | undefined, currency: string | null | undefined): string {
  if (amountMinor === null || amountMinor === undefined || !currency) return '—';
  return formatMoney(amountMinor, currency);
}

export function dateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function date(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function relative(value: string | Date): string {
  const diff = Date.now() - new Date(value).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return date(value);
}

/** Integer basis points -> "12.34%" (string math, no float money). */
export function bps(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}%`;
}
