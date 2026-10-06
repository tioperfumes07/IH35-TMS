/**
 * ROUND 321 (CC-1) — ASC 842 LESSEE schedule for a lease-to-own (pure, integer cents, no I/O).
 *
 * Classification follows the owner's locked B1 rule: a purchase option at FAIR MARKET VALUE is not a bargain, so the
 * lease is OPERATING; a FIXED (payoff) purchase price makes it FINANCE. A lease-to-own with no option is OPERATING.
 * Both are capitalized (ASC 842-20-25-1): right-of-use asset = lease liability = PV of the payments (plus a fixed
 * purchase price at the end of the term, finance only), discounted at the contract rate.
 *
 * Payments are in ADVANCE (billed on each period start by the monthly lease bill engine, same escalatedAmount), so
 * each period: interest = (opening liability - payment) x monthly rate; principal = payment - interest; closing =
 * opening - principal. The last period absorbs rounding so the liability closes at exactly the purchase price
 * (finance, fixed) or zero.
 *   FINANCE:   lease cost = interest + straight-line ROU amortization (over the term, or the asset's useful life when
 *              ownership is expected to transfer and a useful life is given — ASC 842-20-35-8).
 *   OPERATING: lease cost = total payments / term (straight line, ASC 842-20-25-6); ROU amortization = lease cost -
 *              interest, so the ROU asset and the liability both reach zero at the end of the term.
 */
import { escalatedAmount } from "./lessee-escalation.js";

export type PurchaseOptionKind = "none" | "fmv" | "fixed";
export type LesseeClassification = "operating" | "finance";

/** Pure: the owner's B1 rule. */
export function classifyLessee(kind: PurchaseOptionKind | null | undefined): LesseeClassification {
  return kind === "fixed" ? "finance" : "operating";
}

export type LesseeScheduleInput = {
  commencement: string; // YYYY-MM-01
  periods: number; // months
  baseMonthlyCents: number;
  escalationBps?: number | null;
  escalationEveryMonths?: number | null;
  annualRateBps: number; // discount rate (rate implicit, else incremental borrowing rate)
  classification: LesseeClassification;
  purchaseOptionCents?: number | null; // finance + fixed only: paid at the end of the term
  usefulLifeMonths?: number | null; // finance: amortize over this when ownership is expected to transfer
};

export type LesseeSchedulePeriod = {
  period_no: number;
  period_start: string;
  payment_cents: number;
  interest_cents: number;
  principal_cents: number;
  liability_open_cents: number;
  liability_close_cents: number;
  rou_amortization_cents: number;
  rou_close_cents: number;
  lease_cost_cents: number;
};

export type LesseeSchedule = {
  classification: LesseeClassification;
  liability_initial_cents: number;
  rou_initial_cents: number;
  liability_final_cents: number;
  rou_final_cents: number;
  periods: LesseeSchedulePeriod[];
};

function addMonths(ym01: string, k: number): string {
  const [y, m] = ym01.split("-").map(Number);
  const t = y * 12 + (m - 1) + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`;
}

/** Pure: split an integer total into n parts, remainder on the last. */
function straightLine(total: number, n: number): number[] {
  const each = Math.trunc(total / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? total - each * (n - 1) : each));
}

export function buildLesseeSchedule(input: LesseeScheduleInput): LesseeSchedule {
  const n = Math.trunc(input.periods);
  if (!/^\d{4}-\d{2}-01$/.test(input.commencement)) throw new Error("lessee_schedule_commencement_must_be_first_of_month");
  if (!(n >= 1)) throw new Error("lessee_schedule_periods_required");
  if (!(input.baseMonthlyCents >= 0)) throw new Error("lessee_schedule_payment_required");
  if (!(input.annualRateBps >= 0)) throw new Error("lessee_schedule_rate_required");
  const finance = input.classification === "finance";
  const option = finance ? Math.max(0, Math.round(input.purchaseOptionCents ?? 0)) : 0;
  const r = input.annualRateBps / 10000 / 12;

  const starts = Array.from({ length: n }, (_, k) => addMonths(input.commencement, k));
  const payments = starts.map((s) => escalatedAmount(input.baseMonthlyCents, input.commencement, s, input.escalationBps ?? null, input.escalationEveryMonths ?? null));
  const disc = (k: number) => (r === 0 ? 1 : Math.pow(1 + r, -k));
  const pv = Math.round(payments.reduce((s, p, k) => s + p * disc(k), 0) + option * disc(n));

  const totalPayments = payments.reduce((s, p) => s + p, 0);
  const amortLife = finance && input.usefulLifeMonths && input.usefulLifeMonths > n ? Math.trunc(input.usefulLifeMonths) : n;
  const financeAmort = finance ? straightLine(pv, amortLife).slice(0, n) : [];
  const operatingCost = finance ? [] : straightLine(totalPayments, n);

  const periods: LesseeSchedulePeriod[] = [];
  let liability = pv;
  let rou = pv;
  for (let k = 0; k < n; k++) {
    const last = k === n - 1;
    const p = payments[k];
    const open = liability;
    const interest = last ? option - (open - p) : Math.round((open - p) * r);
    const principal = p - interest;
    const close = open - principal;
    let amort: number;
    let cost: number;
    if (finance) {
      amort = financeAmort[k];
      cost = interest + amort;
    } else {
      // Sum of interest = total payments - PV exactly (the last period closes the liability at zero), so
      // cost - interest also closes the ROU asset at zero, and every period's JE balances: cost = interest + amort.
      cost = operatingCost[k];
      amort = cost - interest;
    }
    rou -= amort;
    liability = close;
    periods.push({
      period_no: k + 1,
      period_start: starts[k],
      payment_cents: p,
      interest_cents: interest,
      principal_cents: principal,
      liability_open_cents: open,
      liability_close_cents: close,
      rou_amortization_cents: amort,
      rou_close_cents: rou,
      lease_cost_cents: cost,
    });
  }
  return {
    classification: input.classification,
    liability_initial_cents: pv,
    rou_initial_cents: pv,
    liability_final_cents: liability,
    rou_final_cents: rou,
    periods,
  };
}
