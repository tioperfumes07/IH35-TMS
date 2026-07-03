// F1 — Break-Even Analysis (READ-ONLY analytics client).
// The page is gated behind this OFF-by-default flag; with no lib.feature_flags row the resolver
// returns false, so the Break-Even surface stays dark until an owner enables it. The single GET
// reuses existing read-only accounting reads (P&L) + a read-only SELECT over mdata.loads — NO new
// posting path, NO money mutation. The break-even MODEL is computed client-side (see computeBreakEven)
// so the owner can reclassify lines as a non-persisted what-if.
import { apiRequest } from "./client";

export const FINANCE_BREAK_EVEN_UI_FLAG = "FINANCE_BREAK_EVEN_UI_ENABLED";

export type BreakEvenClassification = "fixed" | "variable";

export type BreakEvenExpenseLine = {
  account_code: string;
  account_name: string;
  account_type: string;
  amount_cents: number;
  default_classification: BreakEvenClassification;
};

export type BreakEvenInputs = {
  operating_company_id: string;
  from_date: string;
  to_date: string;
  days_in_period: number;
  generated_at: string;
  read_only: true;
  disclaimer: string;
  revenue: {
    gl_revenue_cents: number;
    loads_gross_revenue_cents: number;
  };
  miles: {
    total_miles: number;
    loaded_miles: number;
    deadhead_miles: number;
    load_count: number;
  };
  expense_lines: BreakEvenExpenseLine[];
  totals: {
    fixed_cost_cents: number;
    variable_cost_cents: number;
    total_cost_cents: number;
  };
};

export async function getBreakEvenInputs(params: {
  operating_company_id: string;
  from_date?: string;
  to_date?: string;
}): Promise<BreakEvenInputs> {
  const query = new URLSearchParams({ operating_company_id: params.operating_company_id });
  if (params.from_date) query.set("from_date", params.from_date);
  if (params.to_date) query.set("to_date", params.to_date);
  return apiRequest<BreakEvenInputs>(`/api/v1/finance/break-even?${query.toString()}`);
}

// ── Break-even model (ATBS/McLeod cost-per-mile framing) ──────────────────────────────────────
// Cost per mile = (fixed_cost / miles) + (variable_cost / miles)
// Break-even rate/mile = total_cost / miles
// Contribution margin/mile = revenue/mile − variable_cost/mile
// Break-even miles = fixed_cost / contribution_margin_per_mile  (only when CM > 0)
// All money in integer cents; per-mile figures returned in cents/mile (float) for display.
export type BreakEvenModel = {
  miles: number;
  days: number;
  revenue_cents: number;
  fixed_cost_cents: number;
  variable_cost_cents: number;
  total_cost_cents: number;
  // Per-mile (cents/mile) — null when miles = 0.
  revenue_per_mile_cents: number | null;
  variable_cost_per_mile_cents: number | null;
  fixed_cost_per_mile_cents: number | null;
  total_cost_per_mile_cents: number | null; // = break-even rate/mile
  contribution_margin_per_mile_cents: number | null;
  profit_per_mile_cents: number | null;
  // Per-day (cents/day) — null when days = 0.
  fixed_cost_per_day_cents: number | null;
  // Break-even miles to cover fixed costs at the current CM — null when CM <= 0 or miles = 0.
  break_even_miles: number | null;
  net_profit_cents: number;
};

export function computeBreakEven(args: {
  miles: number;
  days: number;
  revenue_cents: number;
  fixed_cost_cents: number;
  variable_cost_cents: number;
}): BreakEvenModel {
  const { miles, days, revenue_cents, fixed_cost_cents, variable_cost_cents } = args;
  const total_cost_cents = fixed_cost_cents + variable_cost_cents;
  const hasMiles = miles > 0;
  const hasDays = days > 0;

  const revenue_per_mile_cents = hasMiles ? revenue_cents / miles : null;
  const variable_cost_per_mile_cents = hasMiles ? variable_cost_cents / miles : null;
  const fixed_cost_per_mile_cents = hasMiles ? fixed_cost_cents / miles : null;
  const total_cost_per_mile_cents = hasMiles ? total_cost_cents / miles : null;
  const contribution_margin_per_mile_cents =
    revenue_per_mile_cents != null && variable_cost_per_mile_cents != null
      ? revenue_per_mile_cents - variable_cost_per_mile_cents
      : null;
  const profit_per_mile_cents =
    revenue_per_mile_cents != null && total_cost_per_mile_cents != null
      ? revenue_per_mile_cents - total_cost_per_mile_cents
      : null;
  const break_even_miles =
    contribution_margin_per_mile_cents != null && contribution_margin_per_mile_cents > 0
      ? fixed_cost_cents / contribution_margin_per_mile_cents
      : null;

  return {
    miles,
    days,
    revenue_cents,
    fixed_cost_cents,
    variable_cost_cents,
    total_cost_cents,
    revenue_per_mile_cents,
    variable_cost_per_mile_cents,
    fixed_cost_per_mile_cents,
    total_cost_per_mile_cents,
    contribution_margin_per_mile_cents,
    profit_per_mile_cents,
    fixed_cost_per_day_cents: hasDays ? fixed_cost_cents / days : null,
    break_even_miles,
    net_profit_cents: revenue_cents - total_cost_cents,
  };
}
