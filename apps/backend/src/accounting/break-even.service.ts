// F1 — Break-Even Analysis (READ-ONLY analytics/estimate).
//
// A trucking cost-per-mile / break-even model for ONE operating company, built entirely from
// EXISTING read surfaces. It NEVER posts, writes, or moves money — every statement is a SELECT:
//   • revenue + expense GL lines → getProfitLossReport() (accounting.journal_entry_postings,
//     opco-scoped, voided excluded, posted batches only)
//   • operating miles + gross load revenue → a single SELECT over mdata.loads (+ load_stops
//     for the period date), opco-scoped, soft-deleted/draft/cancelled excluded.
//
// The fixed-vs-variable split is the standard trucking cost-per-mile framing (ATBS/McLeod):
//   variable (per-mile): fuel, tires, maintenance/repairs, tolls, DEF, oil, lube, wash, scales
//   fixed (per-day):     everything else (truck payment, insurance, permits, licenses, depreciation…)
// This service only supplies a DEFAULT classification per GL line; the UI lets the owner reclassify
// each line as a non-persisted what-if. Nothing here is authoritative accounting — it is an estimate.
//
// Money is integer cents. Per-entity only — no cross-entity totals.

import { withCurrentUser } from "../auth/db.js";
import { getProfitLossReport, type ProfitLossLine } from "./profit-loss.service.js";

export type BreakEvenClassification = "fixed" | "variable";

export type BreakEvenExpenseLine = {
  account_code: string;
  account_name: string;
  account_type: string;
  // Period total for this expense account, positive = expense (integer cents).
  amount_cents: number;
  // Default fixed/variable bucket; the UI can override this as a what-if.
  default_classification: BreakEvenClassification;
};

export type BreakEvenInputs = {
  operating_company_id: string;
  from_date: string;
  to_date: string;
  days_in_period: number;
  generated_at: string;
  read_only: true;
  // Estimate/analytics — never posted. Surfaced so the client can label it honestly.
  disclaimer: string;
  revenue: {
    // Accounting-recognized revenue from the P&L (same basis as the expense lines).
    gl_revenue_cents: number;
    // Gross customer rate summed off mdata.loads.rate_total_cents for the period.
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
    // Sums using the DEFAULT classification above (the UI recomputes when the owner reclassifies).
    fixed_cost_cents: number;
    variable_cost_cents: number;
    total_cost_cents: number;
  };
};

const num = (v: unknown): number => Number(v ?? 0);

// ATBS/McLeod cost-per-mile convention: costs that rise with miles run are VARIABLE; everything
// else is FIXED (hits whether the truck rolls or sits). Keyword match on the GL account name.
const VARIABLE_KEYWORDS = [
  "fuel",
  "diesel",
  "gas",
  "tire",
  "maintenance",
  "repair",
  "toll",
  "def ",
  "def-",
  "diesel exhaust",
  "oil",
  "lube",
  "wash",
  "scale",
  "roadside",
  "tire",
];

export function classifyExpense(accountName: string): BreakEvenClassification {
  const name = (accountName || "").toLowerCase();
  return VARIABLE_KEYWORDS.some((kw) => name.includes(kw)) ? "variable" : "fixed";
}

function daysBetweenInclusive(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return 1;
  return Math.floor((to - from) / 86_400_000) + 1;
}

async function readLoadMiles(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  operatingCompanyId: string,
  fromDate: string,
  toDate: string,
): Promise<{ total_miles: number; loaded_miles: number; deadhead_miles: number; load_count: number; loads_gross_revenue_cents: number }> {
  // Miles come from mdata.loads (GL has none). loaded_miles/deadhead_miles_to_pickup (0308) are
  // primary; the book-load v4 fields (0140: miles_practical/shortest/deadhead) are defensive
  // fallbacks so sparse data degrades to a smaller number rather than erroring. Period date =
  // the load's last stop departure, falling back to created_at when stops carry no timestamp.
  const res = await client.query(
    `
      SELECT
        COALESCE(SUM(COALESCE(l.loaded_miles, l.miles_practical, l.miles_shortest, 0)), 0)::bigint      AS loaded_miles,
        COALESCE(SUM(COALESCE(l.deadhead_miles_to_pickup, l.miles_deadhead, 0)), 0)::bigint             AS deadhead_miles,
        COALESCE(SUM(l.rate_total_cents), 0)::bigint                                                    AS loads_gross_revenue_cents,
        COUNT(*)::bigint                                                                                AS load_count
      FROM mdata.loads l
      WHERE l.operating_company_id = $1::uuid
        AND l.soft_deleted_at IS NULL
        AND l.status::text NOT IN ('draft', 'cancelled')
        -- BREAKEVEN-INCLUDES-SAMPLE-DATA — a break-even rate that a dispatcher prices real freight
        -- against must not be inflated/deflated by test loads. mdata.loads.is_sample_data is derived
        -- reliably at creation (book-load.service.ts FAIL-D6), unlike journal_entries' equivalent
        -- flag (see the GL-side note below) — safe to filter here.
        AND COALESCE(l.is_sample_data, false) = false
        AND COALESCE(
              (SELECT MAX(s.actual_departure_at) FROM mdata.load_stops s WHERE s.load_id = l.id),
              l.created_at
            )::date BETWEEN $2::date AND $3::date
    `,
    [operatingCompanyId, fromDate, toDate],
  );
  const r = res.rows[0] ?? {};
  const loaded = num(r.loaded_miles);
  const deadhead = num(r.deadhead_miles);
  return {
    loaded_miles: loaded,
    deadhead_miles: deadhead,
    total_miles: loaded + deadhead,
    load_count: num(r.load_count),
    loads_gross_revenue_cents: num(r.loads_gross_revenue_cents),
  };
}

export async function getBreakEvenInputs(input: {
  userId: string;
  operating_company_id: string;
  from_date: string;
  to_date: string;
}): Promise<BreakEvenInputs> {
  const { userId, operating_company_id, from_date, to_date } = input;

  // Revenue + expense lines reuse the read-only P&L service (manages its own opco-scoped client).
  //
  // BREAKEVEN-INCLUDES-SAMPLE-DATA — GL side is NOT filtered on journal_entries.is_sample_data here,
  // and that is deliberate, not an oversight: traced live (2026-08-11) and the flag is UNRELIABLE —
  // two journal entries from clearly-identical Cascade sweep sample expenses read is_sample_data
  // true and false respectively, because expenses.routes.ts derives it from the source expense row
  // and several OTHER expense/bill/payment writers never set it at all (ACCT-F353 census). Filtering
  // on an unreliable flag would launder some sample GL lines through as "verified clean" while
  // missing others — worse than the current honest "includes test data" disclaimer below. Filter
  // this leg once ACCT-F353's writer sweep makes the flag trustworthy across all money tables.
  const pnl = await getProfitLossReport({ userId, operating_company_id, from_date, to_date });

  // COGS + operating expenses are the cost universe for the break-even split. Positive = expense.
  const expenseSource: ProfitLossLine[] = [...pnl.cogs.lines, ...pnl.operating_expenses.lines];
  const expense_lines: BreakEvenExpenseLine[] = expenseSource
    .filter((l) => l.amount !== 0)
    .map((l) => ({
      account_code: l.account_code,
      account_name: l.account_name,
      account_type: l.account_type,
      amount_cents: l.amount,
      default_classification: classifyExpense(l.account_name),
    }));

  let fixed_cost_cents = 0;
  let variable_cost_cents = 0;
  for (const line of expense_lines) {
    if (line.default_classification === "variable") variable_cost_cents += line.amount_cents;
    else fixed_cost_cents += line.amount_cents;
  }

  const loads = await withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operating_company_id]);
    return readLoadMiles(client, operating_company_id, from_date, to_date);
  });

  return {
    operating_company_id,
    from_date,
    to_date,
    days_in_period: daysBetweenInclusive(from_date, to_date),
    generated_at: new Date().toISOString(),
    read_only: true as const,
    disclaimer:
      "Analytics estimate only — computed live from existing GL and load data. Nothing here is posted, and the fixed/variable split is an editable planning assumption, not an accounting entry. " +
      "Miles/load-count/loads-revenue exclude sample/test loads; GL revenue and expense lines may still include untagged sample entries (sample-data tagging on the GL side is incomplete — ACCT-F353).",
    revenue: {
      gl_revenue_cents: pnl.revenue.total,
      loads_gross_revenue_cents: loads.loads_gross_revenue_cents,
    },
    miles: {
      total_miles: loads.total_miles,
      loaded_miles: loads.loaded_miles,
      deadhead_miles: loads.deadhead_miles,
      load_count: loads.load_count,
    },
    expense_lines,
    totals: {
      fixed_cost_cents,
      variable_cost_cents,
      total_cost_cents: fixed_cost_cents + variable_cost_cents,
    },
  };
}
