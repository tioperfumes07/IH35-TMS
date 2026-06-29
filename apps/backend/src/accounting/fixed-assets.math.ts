// Fixed-asset depreciation schedule math (ASC 360) — pure, no DB, no side effects.
//
// Extracted from fixed-assets.routes.ts so the READ/COMPUTE route AND the FIN-21 depreciation GL
// poster share ONE schedule computation (single source of truth — never two diverging copies of the
// straight-line / declining-balance / convention logic). Money = integer cents.

export type AssetForCompute = {
  purchase_price_cents: number;
  salvage_value_cents: number;
  in_service_date: string;
  method: string;
  useful_life_months: number;
  convention: string;
  prior_accumulated_depr_cents: number;
};

export type ScheduleRow = {
  period_number: number;
  period_date: string;
  depreciation_amount_cents: number;
  accumulated_to_date_cents: number;
  book_value_end_cents: number;
  method_snapshot: string;
};

export function addMonthsFirstOfMonth(isoDate: string, monthsToAdd: number): string {
  const [y, m] = isoDate.split("-").map(Number);
  const idx = m - 1 + monthsToAdd;
  const yr = y + Math.floor(idx / 12);
  const mn = ((idx % 12) + 12) % 12;
  return `${yr}-${String(mn + 1).padStart(2, "0")}-01`;
}

/**
 * Compute a monthly depreciation schedule (no persistence, no posting).
 * - straight_line: even monthly over useful life; half_month/mid_month halve the first period
 *   and add a stub period so the depreciable base is fully allocated (down to salvage).
 * - declining_balance: double-declining-balance with automatic switch to straight-line on the
 *   remaining base, floored at salvage value.
 * - units_of_production: requires per-period usage that this module does not track, so the schedule
 *   is returned empty (the caller surfaces an honest note).
 */
export function computeDepreciationSchedule(a: AssetForCompute): { rows: ScheduleRow[]; note: string | null } {
  const base = Math.max(0, a.purchase_price_cents - a.salvage_value_cents);
  const life = a.useful_life_months;
  let accumulated = a.prior_accumulated_depr_cents;
  const startBookValue = a.purchase_price_cents - a.prior_accumulated_depr_cents;

  if (a.method === "units_of_production") {
    return { rows: [], note: "Units-of-production schedule requires per-period usage data, which is not tracked in this read-only view." };
  }
  if (base <= 0 || life <= 0) {
    return { rows: [], note: "No depreciable base (cost equals salvage) or invalid useful life." };
  }

  const rows: ScheduleRow[] = [];
  const halfFirst = a.convention === "half_month" || a.convention === "mid_month";

  if (a.method === "declining_balance") {
    const rate = 2 / life;
    let bookValue = startBookValue;
    let remaining = Math.max(0, bookValue - a.salvage_value_cents);
    const totalPeriods = life;
    for (let i = 0; i < totalPeriods && remaining > 0; i++) {
      const slRemaining = Math.round(remaining / (totalPeriods - i));
      let amount = Math.max(Math.round(bookValue * rate), slRemaining);
      if (amount > remaining) amount = remaining;
      accumulated += amount;
      bookValue -= amount;
      remaining -= amount;
      rows.push({
        period_number: i + 1,
        period_date: addMonthsFirstOfMonth(a.in_service_date, i),
        depreciation_amount_cents: amount,
        accumulated_to_date_cents: accumulated,
        book_value_end_cents: bookValue,
        method_snapshot: "declining_balance",
      });
    }
    return { rows, note: null };
  }

  // straight_line
  const monthly = Math.floor(base / life);
  const periods = halfFirst ? life + 1 : life;
  let allocated = 0;
  let bookValue = startBookValue;
  for (let i = 0; i < periods; i++) {
    let amount: number;
    if (halfFirst && i === 0) amount = Math.floor(monthly / 2);
    else if (i === periods - 1) amount = base - allocated; // stub absorbs rounding remainder
    else amount = monthly;
    if (amount < 0) amount = 0;
    if (allocated + amount > base) amount = base - allocated;
    allocated += amount;
    accumulated += amount;
    bookValue -= amount;
    rows.push({
      period_number: i + 1,
      period_date: addMonthsFirstOfMonth(a.in_service_date, i),
      depreciation_amount_cents: amount,
      accumulated_to_date_cents: accumulated,
      book_value_end_cents: bookValue,
      method_snapshot: "straight_line",
    });
  }
  return { rows, note: null };
}

export function asOfToday(rows: ScheduleRow[]): { depr_to_date_cents: number; book_value_now_cents: number } {
  const today = new Date().toISOString().slice(0, 10);
  let last: ScheduleRow | null = null;
  for (const r of rows) {
    if (r.period_date <= today) last = r;
    else break;
  }
  if (!last) return { depr_to_date_cents: 0, book_value_now_cents: 0 };
  return { depr_to_date_cents: last.accumulated_to_date_cents, book_value_now_cents: last.book_value_end_cents };
}
