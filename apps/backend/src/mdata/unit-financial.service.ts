import { withSavepoint } from "../auth/db.js";
import { createTtlCache } from "../lib/ttl-cache.js";

export type FinancialPeriod = "YTD" | "quarter" | "month";

export type UnitFinancialContributingLoad = {
  id: string;
  load_number: string | null;
  rate_total_cents: number;
  date: string;
};

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
  // FLEET-UNIT-FINANCIAL-PL-LOAD-REVERSE-MISSING — real contributing-load identities for the
  // selected period, not a decorative link: these are the exact mdata.loads rows load_scope (below)
  // summed to produce revenue_cents/total_miles above, so the drill-through always points at rows
  // that actually fed the math. Capped and counted (never a silent cap — CLS-NO-SILENT-LIST-CAPS).
  contributing_loads: UnitFinancialContributingLoad[];
  contributing_loads_total_count: number;
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
        -- ACCT-F5625 — fuel.fuel_transactions.load_id is legitimately NULL on the large majority of
        -- rows (fuel cards swipe with no load at ingest time — see fuel.fuel_transactions itself and
        -- the withdrawn LV-FUEL-LOAD-ATTRIBUTION-NEVER-MATCHES row), but the SAME rows overwhelmingly
        -- DO carry a real unit_id. Attributing fuel to a unit ONLY via the load join therefore
        -- silently computed $0.00 fuel cost for every unit whose fuel spend has no load_id — confirmed
        -- live on prod: 1,416 of 1,556 TRANSP fuel rows have a populated unit_id and zero of them have
        -- a load_id, worth $571,802.14 that never reached this P&L. COALESCE(l.assigned_unit_id,
        -- ft.unit_id) attributes by the load's assigned unit when a load exists (preserving the prior
        -- date-scope behavior for load-attributed rows), falling back to the fuel transaction's own
        -- unit_id when it doesn't — and the date scope falls back the same way, to the transaction's
        -- own date, so a no-load row is never silently excluded by a load-only date filter either.
        SELECT COALESCE(SUM(ROUND(ft.total_cost::numeric * 100)), 0)::text AS fuel_cents
        FROM fuel.fuel_transactions ft
        LEFT JOIN mdata.loads l ON l.id = ft.load_id
                                AND l.operating_company_id = $1::uuid
                                AND l.soft_deleted_at IS NULL
        WHERE ft.operating_company_id = $1::uuid
          AND ft.archived_at IS NULL
          AND COALESCE(l.assigned_unit_id, ft.unit_id) = $2::uuid
          AND COALESCE(l.created_at::date, ft.transaction_at::date) BETWEEN $3::date AND $4::date
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

// FLEET-UNIT-FINANCIAL-PL-LOAD-REVERSE-MISSING — the real load rows contributing to this unit's
// period revenue, same WHERE clause as load_scope in queryUnitFinancialRow above so the identities
// returned always match what was actually summed. Capped, with an honest total count so the UI can
// say "+N more" instead of silently truncating (CLS-NO-SILENT-LIST-CAPS).
const CONTRIBUTING_LOADS_LIMIT = 25;

async function queryContributingLoads(
  client: DbClient,
  operatingCompanyId: string,
  unitId: string,
  periodStart: string,
  periodEnd: string
): Promise<{ loads: UnitFinancialContributingLoad[]; totalCount: number }> {
  const res = await client.query<{
    id: string;
    load_number: string | null;
    rate_total_cents: string;
    date: string;
    total_count: string;
  }>(
    `
      WITH load_scope AS (
        SELECT l.id, l.load_number, l.rate_total_cents, l.created_at
        FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid
          AND l.assigned_unit_id = $2::uuid
          AND l.soft_deleted_at IS NULL
          AND l.created_at::date BETWEEN $3::date AND $4::date
      )
      SELECT
        id::text AS id,
        load_number,
        COALESCE(rate_total_cents, 0)::text AS rate_total_cents,
        created_at::date::text AS date,
        COUNT(*) OVER ()::text AS total_count
      FROM load_scope
      ORDER BY created_at DESC
      LIMIT $5
    `,
    [operatingCompanyId, unitId, periodStart, periodEnd, CONTRIBUTING_LOADS_LIMIT]
  );
  return {
    loads: res.rows.map((r) => ({
      id: r.id,
      load_number: r.load_number,
      rate_total_cents: num(r.rate_total_cents),
      date: r.date,
    })),
    totalCount: res.rows.length > 0 ? num(res.rows[0].total_count) : 0,
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
  const contributing = await queryContributingLoads(client, operatingCompanyId, unitId, start, end);

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
    contributing_loads: contributing.loads,
    contributing_loads_total_count: contributing.totalCount,
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
