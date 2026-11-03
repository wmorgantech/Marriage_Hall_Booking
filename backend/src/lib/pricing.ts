// Money is whole rupees (Postgres INT4). Bookings snapshot the hall's price at booking time, so later
// price edits never rewrite existing bookings.

/** Upper bounds for user-supplied numbers — well under INT4's 2,147,483,647 so nothing can overflow the DB. */
export const LIMITS = {
  /** ₹10 crore per day. */
  price: 100_000_000,
  /** ₹50 crore for a full event package. */
  perEventPrice: 500_000_000,
  /** Seating / dining / guest counts. */
  headcount: 100_000,
} as const;

/**
 * Booking amounts for one day at `price` with `advancePercent` (0–100) due as advance.
 * The advance is rounded to the nearest rupee and can never exceed the total.
 * (Currently the total is the hall's per-day price: one date per booking, no taxes, and
 * `perEventPrice` is informational only.)
 */
export function computeBookingAmounts(price: number, advancePercent: number) {
  const totalAmount = price;
  const advanceAmount = Math.min(totalAmount, Math.max(0, Math.round((price * advancePercent) / 100)));
  return { totalAmount, advanceAmount, balanceAmount: totalAmount - advanceAmount };
}
