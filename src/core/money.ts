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

export function assertCents(c: number): asserts c is Cents {
  if (!Number.isInteger(c)) throw new Error(`money must be integer cents, got ${c}`);
}
