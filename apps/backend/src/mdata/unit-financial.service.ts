import { withSavepoint } from "../auth/db.js";
import { createTtlCache } from "../lib/ttl-cache.js";

export type FinancialPeriod = "YTD" | "quarter" | "month";

export type UnitFinancialSnapshot = {
  revenue_cents: number;
  fuel_cost_cents: number;
  maintenance_cost_cents: number;
  driver_pay_cents: number;
  insurance_cost_cents: number;
  total_operating_cost_cents: number;
  gross_profit_cents: number;
  total_miles: number;
  profit_per_mile_cents: number | null;
  profit_per_day_cents: number | null;
  utilization_pct: number | null;
  fleet_avg: {
    revenue_cents: number;
    cost_cents: number;
    profit_per_mile_cents: number | null;
  };
  period: FinancialPeriod;
  period_start: string;
  period_end: string;
};

export type ComparableMetrics = {
  fleet_avg_maintenance_per_mile_cents: number | null;
  this_unit_maintenance_per_mile_cents: number | null;
  deviation_pct: number | null;
  rank_in_fleet: number | null;
  total_units_in_fleet: number;
};

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

const FINANCIAL_CACHE_TTL_MS = 5 * 60 * 1000;
const financialCache = createTtlCache<UnitFinancialSnapshot>();
const comparableCache = createTtlCache<ComparableMetrics>();

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function getFinancialPeriodBounds(period: FinancialPeriod): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  if (period === "month") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
    return { start, end };
  }
  if (period === "quarter") {
    const q = Math.floor(now.getUTCMonth() / 3);
    const start = new Date(Date.UTC(now.getUTCFullYear(), q * 3, 1)).toISOString().slice(0, 10);
    return { start, end };
  }
  return { start: `${now.getUTCFullYear()}-01-01`, end };
}

/** Profit-per-truck CTE pattern — single unit slice (assigned_unit_id, load_id joins). */
async function queryUnitFinancialRow(
  client: DbClient,
  operatingCompanyId: string,
  unitId: string,
  periodStart: string,
  periodEnd: string
) {
  const baseRes = await client.query<{
    revenue_cents: string;
    miles_driven: string;
    driver_pay_cents: string;
    maintenance_cents: string;
  }>(
    `
      WITH load_scope AS (
        SELECT
          l.id,
          l.assigned_unit_id,
          l.rate_total_cents,
          COALESCE(l.miles_practical, l.miles_shortest, 0)::bigint AS trip_miles
        FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid
          AND l.assigned_unit_id = $2::uuid
          AND l.soft_deleted_at IS NULL
          AND l.created_at::date BETWEEN $3::date AND $4::date
      ),
      agg AS (
        SELECT
          COALESCE(SUM(ls.rate_total_cents), 0)::bigint AS revenue_cents,
          COALESCE(SUM(ls.trip_miles), 0)::bigint AS miles_driven
        FROM load_scope ls
      ),
      pay AS (
        SELECT COALESCE(SUM(db.gross_amount_cents), 0)::bigint AS driver_pay_cents
        FROM driver_finance.driver_bills db
        JOIN load_scope l ON l.id = db.load_id
      ),
      maint AS (
        SELECT COALESCE(
          SUM(
            CASE
              WHEN COALESCE(wo.updated_at, wo.opened_at)::date BETWEEN $3::date AND $4::date
              THEN ROUND(COALESCE(wo.total_actual_cost, 0)::numeric * 100)::bigint
              ELSE 0
            END
          ),
          0
        )::bigint AS maintenance_cents
        FROM maintenance.work_orders wo
        WHERE wo.operating_company_id = $1::uuid
          AND wo.unit_id = $2::uuid
      )
      SELECT
        COALESCE(agg.revenue_cents, 0)::text AS revenue_cents,
        COALESCE(agg.miles_driven, 0)::text AS miles_driven,
        COALESCE(pay.driver_pay_cents, 0)::text AS driver_pay_cents,
        COALESCE(maint.maintenance_cents, 0)::text AS maintenance_cents
      FROM agg
      LEFT JOIN pay ON true
      LEFT JOIN maint ON true
    `,
    [operatingCompanyId, unitId, periodStart, periodEnd]
  );

  const fuelRes = await withSavepoint(
    client,
    "unit_financial_fuel",
    () =>
      client.query<{ fuel_cents: string }>(
        `
        SELECT COALESCE(SUM(ROUND(ft.total_cost::numeric * 100)), 0)::text AS fuel_cents
        FROM fuel.fuel_transactions ft
        JOIN mdata.loads l ON l.id = ft.load_id
        WHERE ft.operating_company_id = $1::uuid
          AND l.assigned_unit_id = $2::uuid
          AND l.soft_deleted_at IS NULL
          AND l.created_at::date BETWEEN $3::date AND $4::date
      `,
        [operatingCompanyId, unitId, periodStart, periodEnd]
      ),
    { rows: [{ fuel_cents: "0" }] }
  );

  const row = baseRes.rows[0] ?? {
    revenue_cents: "0",
    miles_driven: "0",
    driver_pay_cents: "0",
    maintenance_cents: "0",
  };
  return {
    revenue_cents: num(row.revenue_cents),
    miles_driven: num(row.miles_driven),
    driver_pay_cents: num(row.driver_pay_cents),
    maintenance_cents: num(row.maintenance_cents),
    fuel_cost_cents: num(fuelRes.rows[0]?.fuel_cents),
  };
}

async function queryFleetAverages(client: DbClient, operatingCompanyId: string, periodStart: string, periodEnd: string) {
  const res = await client.query<{
    unit_count: string;
    revenue_cents: string;
    cost_cents: string;
    miles: string;
  }>(
    `
      WITH load_scope AS (
        SELECT
          l.id,
          l.assigned_unit_id,
          l.rate_total_cents,
          COALESCE(l.miles_practical, l.miles_shortest, 0)::bigint AS trip_miles
        FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid
          AND l.soft_deleted_at IS NULL
          AND l.assigned_unit_id IS NOT NULL
          AND l.created_at::date BETWEEN $2::date AND $3::date
      ),
      per_unit AS (
        SELECT
          ls.assigned_unit_id AS unit_id,
          COALESCE(SUM(ls.rate_total_cents), 0)::bigint AS revenue_cents,
          COALESCE(SUM(ls.trip_miles), 0)::bigint AS miles
        FROM load_scope ls
        GROUP BY ls.assigned_unit_id
      ),
      pay AS (
        SELECT l.assigned_unit_id AS unit_id, COALESCE(SUM(db.gross_amount_cents), 0)::bigint AS driver_pay_cents
        FROM driver_finance.driver_bills db
        JOIN load_scope l ON l.id = db.load_id
        GROUP BY l.assigned_unit_id
      ),
      maint AS (
        SELECT
          wo.unit_id,
          COALESCE(
            SUM(
              CASE
                WHEN COALESCE(wo.updated_at, wo.opened_at)::date BETWEEN $2::date AND $3::date
                THEN ROUND(COALESCE(wo.total_actual_cost, 0)::numeric * 100)::bigint
                ELSE 0
              END
            ),
            0
          )::bigint AS maintenance_cents
        FROM maintenance.work_orders wo
        WHERE wo.operating_company_id = $1::uuid
        GROUP BY wo.unit_id
      )
      SELECT
        COUNT(DISTINCT pu.unit_id)::text AS unit_count,
        COALESCE(SUM(pu.revenue_cents), 0)::text AS revenue_cents,
        COALESCE(SUM(COALESCE(p.driver_pay_cents, 0) + COALESCE(m.maintenance_cents, 0)), 0)::text AS cost_cents,
        COALESCE(SUM(pu.miles), 0)::text AS miles
      FROM per_unit pu
      LEFT JOIN pay p ON p.unit_id = pu.unit_id
      LEFT JOIN maint m ON m.unit_id = pu.unit_id
    `,
    [operatingCompanyId, periodStart, periodEnd]
  );
  const row = res.rows[0] ?? { unit_count: "0", revenue_cents: "0", cost_cents: "0", miles: "0" };
  const unitCount = Math.max(1, num(row.unit_count));
  const revenue = num(row.revenue_cents);
  const cost = num(row.cost_cents);
  const miles = num(row.miles);
  return {
    revenue_cents: Math.round(revenue / unitCount),
    cost_cents: Math.round(cost / unitCount),
    profit_per_mile_cents: miles > 0 ? Math.round((revenue - cost) / miles) : null,
  };
}

export async function getUnitFinancialYTD(
  client: DbClient,
  unitId: string,
  operatingCompanyId: string,
  period: FinancialPeriod = "YTD"
): Promise<UnitFinancialSnapshot> {
  const { start, end } = getFinancialPeriodBounds(period);
  const cacheKey = `${operatingCompanyId}:${unitId}:${period}:${start}:${end}`;
  const hit = financialCache.get(cacheKey);
  if (hit) return hit;

  const row = await queryUnitFinancialRow(client, operatingCompanyId, unitId, start, end);
  const fleet_avg = await queryFleetAverages(client, operatingCompanyId, start, end);

  const insurance_cost_cents = 0;
  const total_operating_cost_cents =
    row.fuel_cost_cents + row.maintenance_cents + row.driver_pay_cents + insurance_cost_cents;
  const gross_profit_cents = row.revenue_cents - total_operating_cost_cents;
  const periodDays = Math.max(
    1,
    Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / (24 * 60 * 60 * 1000)) + 1
  );

  const snapshot: UnitFinancialSnapshot = {
    revenue_cents: row.revenue_cents,
    fuel_cost_cents: row.fuel_cost_cents,
    maintenance_cost_cents: row.maintenance_cents,
    driver_pay_cents: row.driver_pay_cents,
    insurance_cost_cents,
    total_operating_cost_cents,
    gross_profit_cents,
    total_miles: row.miles_driven,
    profit_per_mile_cents: row.miles_driven > 0 ? Math.round(gross_profit_cents / row.miles_driven) : null,
    profit_per_day_cents: Math.round(gross_profit_cents / periodDays),
    utilization_pct: row.miles_driven > 0 ? Math.min(100, Math.round((row.miles_driven / (periodDays * 500)) * 100)) : null,
    fleet_avg,
    period,
    period_start: start,
    period_end: end,
  };

  financialCache.set(cacheKey, snapshot, FINANCIAL_CACHE_TTL_MS);
  return snapshot;
}

export async function getComparableMetrics(
  client: DbClient,
  unitId: string,
  operatingCompanyId: string,
  period: FinancialPeriod = "YTD"
): Promise<ComparableMetrics> {
  const { start, end } = getFinancialPeriodBounds(period);
  const cacheKey = `cmp:${operatingCompanyId}:${unitId}:${period}:${start}:${end}`;
  const hit = comparableCache.get(cacheKey);
  if (hit) return hit;

  const res = await client.query<{ unit_id: string; maintenance_cents: string; miles: string }>(
    `
      WITH load_scope AS (
        SELECT l.id, l.assigned_unit_id, COALESCE(l.miles_practical, l.miles_shortest, 0)::bigint AS trip_miles
        FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid
          AND l.soft_deleted_at IS NULL
          AND l.assigned_unit_id IS NOT NULL
          AND l.created_at::date BETWEEN $2::date AND $3::date
      ),
      miles AS (
        SELECT assigned_unit_id AS unit_id, COALESCE(SUM(trip_miles), 0)::bigint AS miles
        FROM load_scope
        GROUP BY assigned_unit_id
      ),
      maint AS (
        SELECT
          wo.unit_id,
          COALESCE(
            SUM(ROUND(COALESCE(wo.total_actual_cost, 0)::numeric * 100))::bigint,
            0
          ) AS maintenance_cents
        FROM maintenance.work_orders wo
        WHERE wo.operating_company_id = $1::uuid
          AND COALESCE(wo.updated_at, wo.opened_at)::date BETWEEN $2::date AND $3::date
        GROUP BY wo.unit_id
      )
      SELECT
        m.unit_id::text,
        m.maintenance_cents::text,
        COALESCE(mi.miles, 0)::text AS miles
      FROM maint m
      LEFT JOIN miles mi ON mi.unit_id = m.unit_id
      WHERE COALESCE(mi.miles, 0) > 0
    `,
    [operatingCompanyId, start, end]
  );

  const perMile = res.rows
    .map((r) => ({
      unit_id: String(r.unit_id),
      cents: Math.round(num(r.maintenance_cents) / Math.max(1, num(r.miles))),
    }))
    .sort((a, b) => a.cents - b.cents);

  const total_units_in_fleet = perMile.length;
  const thisRow = perMile.find((r) => r.unit_id === unitId);
  const fleetAvg =
    total_units_in_fleet > 0
      ? Math.round(perMile.reduce((s, r) => s + r.cents, 0) / total_units_in_fleet)
      : null;
  const this_unit_maintenance_per_mile_cents = thisRow?.cents ?? null;
  const deviation_pct =
    fleetAvg != null && this_unit_maintenance_per_mile_cents != null && fleetAvg > 0
      ? Math.round(((this_unit_maintenance_per_mile_cents - fleetAvg) / fleetAvg) * 100)
      : null;
  const rank_in_fleet = thisRow ? perMile.findIndex((r) => r.unit_id === unitId) + 1 : null;

  const metrics: ComparableMetrics = {
    fleet_avg_maintenance_per_mile_cents: fleetAvg,
    this_unit_maintenance_per_mile_cents,
    deviation_pct,
    rank_in_fleet,
    total_units_in_fleet,
  };
  comparableCache.set(cacheKey, metrics, FINANCIAL_CACHE_TTL_MS);
  return metrics;
}
