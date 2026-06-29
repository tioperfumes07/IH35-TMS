// FIN-22 — pure helpers for the lease ASC 842 LESSOR subledger engine.
// No DB, no side effects: the schedule amortization + balance invariants are unit-testable in every
// environment (not only the CI real-Postgres path). NO new GL math touches existing posting functions.

/** Money flag — DEFAULT OFF. With it OFF the FIN-22 poster writes ZERO journal entries. */
export const LEASE_GL_POSTING_FLAG_KEY = "LEASE_GL_POSTING_ENABLED";

export type LeaseElection = "operating" | "sales_type";
export type PaymentFrequency = "monthly" | "quarterly" | "annual";

export type BalancedLine = { debit_or_credit: "debit" | "credit"; amount_cents: number };

export type LeasePostingErrorCode =
  | "LEASE_NOT_FOUND"
  | "LEASE_NOT_POSTABLE"
  | "LEASE_NOT_OPERATING"
  | "LEASE_NOT_SALES_TYPE"
  | "RETITLE_REQUIRED"
  | "SCHEDULE_PERIOD_NOT_FOUND"
  | "NO_LEASE_ASSETS"
  | "ACCOUNT_ROLE_MAPPING_MISSING"
  | "ASSET_ACCOUNT_MISSING"
  | "DISPOSAL_ALREADY_EXISTS"
  | "PERIOD_LOCKED"
  | "UNBALANCED_ENTRY";

export class LeasePostingError extends Error {
  code: LeasePostingErrorCode;
  details?: Record<string, unknown>;
  constructor(code: LeasePostingErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "LeasePostingError";
    this.code = code;
    this.details = details;
  }
}

/** numeric/string dollars -> integer cents (NaN-safe). */
export function dollarsToCents(dollars: number | string | null | undefined): number {
  const n = Number(dollars ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Balance-or-fail: total debits must equal total credits and be > 0. Mirrors the JE balance trigger. */
export function assertBalanced(lines: BalancedLine[]): void {
  const debits = lines.filter((l) => l.debit_or_credit === "debit").reduce((s, l) => s + Number(l.amount_cents || 0), 0);
  const credits = lines.filter((l) => l.debit_or_credit === "credit").reduce((s, l) => s + Number(l.amount_cents || 0), 0);
  if (debits <= 0 || credits <= 0 || debits !== credits) {
    throw new LeasePostingError("UNBALANCED_ENTRY", `Lease posting must be balanced (debits=${debits}, credits=${credits})`);
  }
}

/**
 * Deterministic idempotency key shared across one entry's lines (uq_jep_company_idempotency_line).
 * kind = 'rental' | 'disposal' | 'commencement' | 'interest'; period = the schedule period (or null).
 */
export function buildLeaseIdempotencyKey(
  operatingCompanyId: string,
  leaseContractId: string,
  kind: "rental" | "disposal" | "commencement" | "interest",
  period: number | null
): string {
  return [
    "ih35:lease-gl:v1",
    operatingCompanyId.toLowerCase(),
    leaseContractId.toLowerCase(),
    kind,
    period == null ? "-" : String(period),
  ].join(":");
}

export function periodsPerYear(freq: PaymentFrequency): number {
  if (freq === "monthly") return 12;
  if (freq === "quarterly") return 4;
  return 1; // annual
}

function monthsPerPeriod(freq: PaymentFrequency): number {
  if (freq === "monthly") return 1;
  if (freq === "quarterly") return 3;
  return 12; // annual
}

/** ISO date string (yyyy-mm-dd) advanced by `count` lease periods from `startIso`. */
export function addPeriodsIso(startIso: string, count: number, freq: PaymentFrequency): string {
  const [y, m, d] = startIso.slice(0, 10).split("-").map((s) => Number(s));
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCMonth(base.getUTCMonth() + count * monthsPerPeriod(freq));
  return base.toISOString().slice(0, 10);
}

/** Per-period effective rate for sales-type interest accretion (bps annual -> per-period fraction). */
export function perPeriodRate(discountRateBps: number | null | undefined, freq: PaymentFrequency): number {
  if (discountRateBps == null || discountRateBps <= 0) return 0;
  return discountRateBps / 10000 / periodsPerYear(freq);
}

export type SchedulePeriod = {
  period_number: number;
  period_date: string;
  payment_cents: number;
  rental_income_cents: number;
  interest_cents: number;
  principal_cents: number;
  receivable_balance_cents: number; // ending balance after this period
};

export type ScheduleInput = {
  election: LeaseElection;
  commencement_date: string;
  payment_amount_cents: number;
  payment_frequency: PaymentFrequency;
  number_of_periods: number;
  discount_rate_bps: number | null;
};

/**
 * OPERATING schedule: each period recognizes rental income = the period payment. No interest/principal,
 * no receivable. The asset stays on the lessor's (TRK) books and is depreciated separately (FIN-21).
 */
function generateOperatingSchedule(input: ScheduleInput): SchedulePeriod[] {
  const rows: SchedulePeriod[] = [];
  for (let i = 1; i <= input.number_of_periods; i++) {
    rows.push({
      period_number: i,
      period_date: addPeriodsIso(input.commencement_date, i, input.payment_frequency),
      payment_cents: input.payment_amount_cents,
      rental_income_cents: input.payment_amount_cents,
      interest_cents: 0,
      principal_cents: 0,
      receivable_balance_cents: 0,
    });
  }
  return rows;
}

/** Present value (cents) of an ordinary annuity of `payment` for `n` periods at per-period rate `r`. */
export function presentValueCents(paymentCents: number, n: number, r: number): number {
  if (r <= 0) return paymentCents * n;
  const pv = paymentCents * ((1 - Math.pow(1 + r, -n)) / r);
  return Math.round(pv);
}

/**
 * SALES-TYPE schedule (effective-interest). The lease receivable (net investment) at commencement equals
 * the PV of the payment stream = SUM(principal) across periods. Each period: interest = balance * r,
 * principal = payment - interest; the FINAL period absorbs rounding so the ending balance is exactly 0
 * and principal+interest == payment every period (so the per-period JE balances and SUM(principal) ties
 * back to the commencement receivable exactly). r==0 => all principal, zero interest income.
 */
function generateSalesTypeSchedule(input: ScheduleInput): SchedulePeriod[] {
  const n = input.number_of_periods;
  const payment = input.payment_amount_cents;
  const r = perPeriodRate(input.discount_rate_bps, input.payment_frequency);
  const pv = presentValueCents(payment, n, r);

  const rows: SchedulePeriod[] = [];
  let balance = pv;
  for (let i = 1; i <= n; i++) {
    let interest: number;
    let principal: number;
    if (i === n) {
      // Final period absorbs accumulated rounding: principal clears the remaining balance to 0.
      principal = balance;
      interest = payment - principal;
      if (interest < 0) {
        // Defensive: never emit a negative interest line; clamp principal to the payment.
        principal = payment;
        interest = 0;
      }
    } else {
      interest = Math.round(balance * r);
      principal = payment - interest;
      if (principal < 0) {
        principal = 0;
        interest = payment;
      }
      if (principal > balance) principal = balance;
    }
    balance -= principal;
    if (balance < 0) balance = 0;
    rows.push({
      period_number: i,
      period_date: addPeriodsIso(input.commencement_date, i, input.payment_frequency),
      payment_cents: payment,
      rental_income_cents: 0,
      interest_cents: interest,
      principal_cents: principal,
      receivable_balance_cents: balance,
    });
  }
  return rows;
}

export function generateSchedule(input: ScheduleInput): SchedulePeriod[] {
  return input.election === "sales_type" ? generateSalesTypeSchedule(input) : generateOperatingSchedule(input);
}

/** Commencement lease receivable (cents) for a sales-type lease = SUM(principal) = PV of payments. */
export function salesTypeReceivableCents(schedule: SchedulePeriod[]): number {
  return schedule.reduce((s, p) => s + p.principal_cents, 0);
}
