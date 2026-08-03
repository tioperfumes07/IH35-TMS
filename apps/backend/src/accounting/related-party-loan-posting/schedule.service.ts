/**
 * LOAN-04 — amortization schedule generation for a related-party loan.
 *
 * WRITES NO NEW AMORTIZATION MATH. It calls buildAmortizationSchedule() from
 * finance/loan-wizard/loan-math.ts — the existing, tested implementation that works in integer cents and
 * makes the FINAL period absorb rounding so the ending balance is exactly 0. Re-deriving that here would
 * give the system two amortization implementations that agree until a rounding edge case, and then
 * silently disagree by a cent on a schedule someone is being asked to repay.
 *
 * WHAT THIS FILE DOES ADD: the translation from that generic row shape into
 * accounting.related_party_loan_schedule, and the two things the generic math does not know about:
 *
 *  1. PER-SETTLEMENT FREQUENCY. A related-party loan can be repaid "per settlement" rather than monthly.
 *     There is no calendar for that — settlements happen when loads finish. Those loans get a schedule
 *     with due_date left at the first-payment date for every row: the ROW COUNT and the split are real,
 *     the calendar is not, and the auto-deduct engine consumes them in order as settlements occur.
 *     Inventing weekly dates would put dates on a schedule nobody pays to, which reads as authoritative
 *     and is not.
 *
 *  2. LUMP SUM. One row, full principal plus whatever simple interest applies. buildAmortizationSchedule
 *     assumes a level payment across N periods and cannot express a single balloon.
 *
 * A zero-interest loan is normal here (owner lends the company money at 0%), and the shared math already
 * handles annualRatePct = 0 by straight-lining principal — so it is not special-cased.
 */
import { buildAmortizationSchedule } from "../../finance/loan-wizard/loan-math.js";

export type LoanScheduleRow = {
  payment_number: number;
  due_date: string;
  payment_cents: number;
  principal_cents: number;
  interest_cents: number;
  remaining_balance_cents: number;
};

export type ScheduleInput = {
  principalCents: number;
  /** Basis points, matching the column and finance.loans (600 = 6.00% APR). */
  interestRateBps: number;
  paymentFrequency: "weekly" | "biweekly" | "semimonthly" | "monthly" | "per_settlement" | "lump_sum";
  paymentCount: number | null;
  firstPaymentDate: string;
};

/** Periods per year, used to convert an APR into the per-period rate the shared math expects. */
const PERIODS_PER_YEAR: Record<string, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
  // per_settlement has no calendar cadence; it is treated as monthly for INTEREST accrual purposes only
  // (a defensible, disclosed convention) while its dates stay unset — see the header.
  per_settlement: 12,
};

export function buildLoanSchedule(input: ScheduleInput): LoanScheduleRow[] {
  const { principalCents, interestRateBps, paymentFrequency, paymentCount, firstPaymentDate } = input;
  if (!Number.isInteger(principalCents) || principalCents <= 0) {
    throw new Error("principalCents must be a positive integer");
  }

  // ── lump sum: one balloon row. The shared level-payment math cannot express this. ────────────────
  if (paymentFrequency === "lump_sum") {
    const interest = Math.round((principalCents * interestRateBps) / 10_000);
    return [
      {
        payment_number: 1,
        due_date: firstPaymentDate,
        payment_cents: principalCents + interest,
        principal_cents: principalCents,
        interest_cents: interest,
        remaining_balance_cents: 0,
      },
    ];
  }

  const count = paymentCount && paymentCount > 0 ? paymentCount : 1;
  const periodsPerYear = PERIODS_PER_YEAR[paymentFrequency] ?? 12;

  // The shared function is monthly-shaped: it treats annualRatePct/12 as the per-period rate and adds
  // one MONTH per period. Feeding it an equivalent annual rate makes the per-period interest correct for
  // any cadence; the DATES it produces are only meaningful for monthly, which is why non-monthly cadences
  // re-derive their own dates below.
  const equivalentAnnualPct = (interestRateBps / 100) * (12 / periodsPerYear);

  const rows = buildAmortizationSchedule({
    principalCents,
    annualRatePct: equivalentAnnualPct,
    termMonths: count,
    firstPaymentDate,
  });

  return rows.map((r) => ({
    payment_number: r.period,
    // per_settlement: no calendar exists, so every row keeps the first-payment date rather than
    // asserting a due date that nothing will honour.
    due_date: paymentFrequency === "per_settlement" ? firstPaymentDate : advance(firstPaymentDate, paymentFrequency, r.period - 1),
    payment_cents: r.payment_cents,
    principal_cents: r.principal_cents,
    interest_cents: r.interest_cents,
    remaining_balance_cents: r.balance_cents,
  }));
}

/** Date advance for the non-monthly cadences the shared (monthly) generator cannot date correctly. */
function advance(fromIso: string, frequency: string, periods: number): string {
  const [y, m, d] = fromIso.split("-").map(Number);
  const base = Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  const DAY = 86_400_000;
  if (frequency === "weekly") return iso(base + periods * 7 * DAY);
  if (frequency === "biweekly") return iso(base + periods * 14 * DAY);
  if (frequency === "semimonthly") return iso(base + periods * 15 * DAY);
  // monthly — calendar months, not 30-day jumps, so the day-of-month is preserved.
  const dt = new Date(base);
  const targetMonth = dt.getUTCMonth() + periods;
  const ny = dt.getUTCFullYear() + Math.floor(targetMonth / 12);
  const nm = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${String(ny).padStart(4, "0")}-${String(nm + 1).padStart(2, "0")}-${String(
    Math.min(dt.getUTCDate(), lastDay)
  ).padStart(2, "0")}`;
}

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
