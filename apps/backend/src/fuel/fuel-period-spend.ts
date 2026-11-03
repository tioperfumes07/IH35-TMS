/**
 * Register row 164 (2026-11-03) — ONE fuel spend / avg $/gal reader for every fuel KPI.
 *
 * Before: Fuel Home (GET /fuel/planner/dashboard) summed EVERY fuel.fuel_transactions row whose UTC purchased_at fell in the
 * UTC month — archived + voided rows included — and showed avg(price_per_gallon) (an unweighted mean of row prices). The Fuel
 * board strip summed the live rows (archived_at/voided_at NULL) on transaction_at::date and divided spend by gallons. October
 * 2026 on prod (USMCA): Home $91,539.16 / $5.442 vs board $76,349.13 / $5.494 — the $15,190.03 gap = 24 archived+voided rows.
 *
 * Rule (both surfaces): live rows only (archived_at IS NULL AND voided_at IS NULL), company-scoped, transaction_at::date in
 * [from, to] (company business dates), spend = sum(total_cost), avg $/gal = spend of rows with gallons > 0 / their gallons
 * (volume-weighted — never a mean of row prices).
 */
import { companyBusinessDate } from "../lib/company-business-date.js";

type Queryable = { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> };

export type FuelPeriodSpend = {
  from: string;
  to: string;
  spend: number;
  gallons: number;
  avg_price_per_gallon: number | null;
  fill_count: number;
};

/** The live-row predicate every fuel spend figure applies. */
export function fuelLiveRowSql(alias: string): string {
  return `${alias}.archived_at IS NULL AND ${alias}.voided_at IS NULL`;
}

export const FUEL_PERIOD_SPEND_SQL = `
  SELECT
    COALESCE(sum(ft.total_cost), 0)::numeric AS spend,
    COALESCE(sum(ft.gallons) FILTER (WHERE ft.gallons > 0), 0)::numeric AS gallons,
    (sum(ft.total_cost) FILTER (WHERE ft.gallons > 0) / NULLIF(sum(ft.gallons) FILTER (WHERE ft.gallons > 0), 0))::numeric AS avg_price,
    count(*)::int AS fill_count
  FROM fuel.fuel_transactions ft
  WHERE ft.operating_company_id = $1::uuid
    AND ${fuelLiveRowSql("ft")}
    AND ft.transaction_at::date >= $2::date
    AND ft.transaction_at::date <= $3::date
`;

/** Month-to-date in the company's business calendar (America/Chicago): first of month .. today. */
export function companyMonthToDateRange(now: Date = new Date()): { from: string; to: string } {
  const today = companyBusinessDate(now);
  return { from: `${today.slice(0, 8)}01`, to: today };
}

export async function readFuelPeriodSpend(client: Queryable, operatingCompanyId: string, from: string, to: string): Promise<FuelPeriodSpend> {
  const res = await client.query(FUEL_PERIOD_SPEND_SQL, [operatingCompanyId, from, to]);
  const row = res.rows[0] ?? {};
  const avg = row.avg_price == null ? null : Number(row.avg_price);
  return {
    from,
    to,
    spend: Number(row.spend ?? 0),
    gallons: Number(row.gallons ?? 0),
    avg_price_per_gallon: avg != null && Number.isFinite(avg) ? avg : null,
    fill_count: Number(row.fill_count ?? 0),
  };
}
