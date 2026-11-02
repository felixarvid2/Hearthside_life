// Money is integer cents everywhere. Format only at the UI edge.
import type { Cents } from './types';

export const dollars = (d: number): Cents => Math.round(d * 100);

export function formatMoney(c: Cents): string {
  const sign = c < 0 ? '-' : '';
  const abs = Math.abs(Math.round(c));
  const whole = Math.floor(abs / 100).toLocaleString('en-US');
  const cents = abs % 100;
  return `${sign}$${whole}${cents ? '.' + String(cents).padStart(2, '0') : ''}`;
}

/** For bars too narrow for cents: whole dollars from $1,000 up ("$10,599"), the exact amount below. The full amount stays in the accessible label. */
export function formatMoneyShort(c: Cents): string {
  if (Math.abs(c) < 100000) return formatMoney(c);
  const sign = c < 0 ? '-' : '';
  const whole = Math.floor(Math.abs(Math.round(c)) / 100).toLocaleString('en-US');
  return `${sign}$${whole}`;
}

export function assertCents(c: number): asserts c is Cents {
  if (!Number.isInteger(c)) throw new Error(`money must be integer cents, got ${c}`);
}
