import { describe, expect, it } from 'vitest';
import { LIMITS, computeBookingAmounts } from '../src/lib/pricing';

describe('computeBookingAmounts', () => {
  it('splits a typical booking into advance + balance', () => {
    expect(computeBookingAmounts(100000, 50)).toEqual({ totalAmount: 100000, advanceAmount: 50000, balanceAmount: 50000 });
  });

  it('supports the 0% and 100% extremes', () => {
    expect(computeBookingAmounts(100000, 0)).toEqual({ totalAmount: 100000, advanceAmount: 0, balanceAmount: 100000 });
    expect(computeBookingAmounts(100000, 100)).toEqual({ totalAmount: 100000, advanceAmount: 100000, balanceAmount: 0 });
  });

  it('rounds the advance to the nearest whole rupee (half rounds up)', () => {
    expect(computeBookingAmounts(100001, 50).advanceAmount).toBe(50001); // 50000.5
    expect(computeBookingAmounts(100001, 33).advanceAmount).toBe(33000); // 33000.33
    expect(computeBookingAmounts(55555, 20).advanceAmount).toBe(11111);
  });

  it('advance + balance always equals the total, and the advance never exceeds it', () => {
    for (const price of [1, 999, 55000, 100001, 480000, LIMITS.price]) {
      for (const pct of [0, 1, 20, 33, 50, 67, 99, 100]) {
        const a = computeBookingAmounts(price, pct);
        expect(a.advanceAmount + a.balanceAmount).toBe(a.totalAmount);
        expect(a.advanceAmount).toBeLessThanOrEqual(a.totalAmount);
        expect(a.advanceAmount).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('clamps a bad percentage instead of producing a negative or over-total advance', () => {
    expect(computeBookingAmounts(1000, 150).advanceAmount).toBe(1000);
    expect(computeBookingAmounts(1000, -10).advanceAmount).toBe(0);
  });

  it('stays inside the database INT4 range at the maximum allowed price', () => {
    const max = 2_147_483_647;
    const a = computeBookingAmounts(LIMITS.price, 100);
    expect(a.totalAmount).toBeLessThan(max);
    expect(LIMITS.perEventPrice).toBeLessThan(max);
    expect(LIMITS.headcount).toBeLessThan(max);
  });
});
