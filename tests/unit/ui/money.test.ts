import { describe, expect, it } from 'vitest';
import { formatMoney, formatMoneyShort } from '../../../src/core/money';

describe('formatMoneyShort (narrow HUD bars)', () => {
  it('keeps the exact amount below $1,000', () => {
    expect(formatMoneyShort(0)).toBe('$0');
    expect(formatMoneyShort(99999)).toBe(formatMoney(99999));
    expect(formatMoneyShort(1250)).toBe('$12.50');
  });
  it('drops the cents from $1,000 up and keeps the sign', () => {
    expect(formatMoneyShort(100000)).toBe('$1,000');
    expect(formatMoneyShort(1059946)).toBe('$10,599');
    expect(formatMoneyShort(99999999)).toBe('$999,999');
    expect(formatMoneyShort(-1059946)).toBe('-$10,599');
  });
  it('is never wider than the full amount', () => {
    for (const c of [5, 99999, 100001, 1059946, 99999999]) expect(formatMoneyShort(c).length).toBeLessThanOrEqual(formatMoney(c).length);
  });
});
