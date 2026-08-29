import type { PoolClient } from "pg";
// FLEET-VISIBILITY-F4583-SAMPLE-DATA-GAP (continued): the same shared exclusion already required
// on the Fleet roster/KPI (mdata/fleet-visibility.ts) applies here — a fixture unit must not
// inflate the active-unit-count denominator this per-load insurance allocation estimate divides by.
import { excludeDemoPhantomSql, excludeSampleDataSql } from "../mdata/fleet-visibility.js";

export type LoadProfitabilitySnapshot = {
  load_id: string;
  load_number: string | null;
  customer_name: string | null;
  status: string;
  revenue_cents: number;
  driver_pay_cents: number;
  fuel_cents: number;
  maintenance_cents: number;
  insurance_alloc_cents: number;
  factoring_fee_cents: number;
  accessorial_deductions_cents: number;
  net_profit_cents: number;
  margin_pct: number;
  miles: number;
  computed_at: string;
  data_completeness: "complete" | "partial";
  missing_sources: string[];
};

export type TripProfitabilityRow = {
  settlement_id: string;
  settlement_display_id: string | null;
  driver_id: string | null;
  driver_name: string | null;
  nb_load_id: string | null;
  nb_load_number: string | null;
  sb_load_id: string | null;
  sb_load_number: string | null;
  revenue_cents: number;
  driver_pay_cents: number;
  fuel_cents: number;
  maintenance_cents: number;
  insurance_alloc_cents: number;
  factoring_fee_cents: number;
  accessorial_deductions_cents: number;
  net_profit_cents: number;
  margin_pct: number;
  trip_closed_at: string | null;
};

export type TripProfitabilityResponse = {
  period: { start: string; end: string };
  totals: {
    revenue_cents: number;
    driver_pay_cents: number;
    fuel_cents: number;
    maintenance_cents: number;
    net_profit_cents: number;
    trip_count: number;
  };
  rows: TripProfitabilityRow[];
};

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function marginPct(net: number, revenue: number): number {
  if (revenue <= 0) return 0;
  return Math.round((net / revenue) * 10000) / 100;
}

/**
 * Per-load profitability snapshot. All figures from existing tables — read-only.
 * Formula: Net = Revenue − driver_pay − fuel − maintenance − insurance_alloc − factoring_fee − accessorial_deductions
 * Insurance allocation: premium ÷ active unit count ÷ trip days (estimate; partial when no policy data).
 */
export async function computeLoadProfitability(
  client: PoolClient,
  operatingCompanyId: string,
  loadId: string
): Promise<LoadProfitabilitySnapshot | null> {
  const missSources: string[] = [];

  // 1. Load base + revenue
  const loadRes = await client.query<Record<string, unknown>>(
    `SELECT
       l.id::text,
       l.load_number,
       l.status,
       COALESCE(l.rate_total_cents, 0)::bigint AS revenue_cents,
       COALESCE(l.miles_practical, l.miles_shortest, 0)::bigint AS miles,
       -- DISP-PHANTOM-CLASS: this read l.delivered_at, which DOES NOT EXIST on mdata.loads
       -- (verified on prod 2026-07-27: the table has created_at and updated_at, no delivered_at and
       -- no completed_at). Every call threw 42703, so per-load profitability — revenue vs cost per
       -- mile, the number that decides whether a lane is worth running — returned nothing but an
       -- error. The delivery timestamp lives on the STOP: the last stop_type='delivery' stop's
       -- actual_departure_at (truck-release basis, same as booking-gap.service.ts). Falling back to
       -- updated_at/created_at preserves the original intent for loads not yet delivered.
       -- DSP-MONEY-F7243 — this subquery picked the latest actual_departure_at across EVERY
       -- delivery-type stop row for the load, including one archived by the Stops-replace
       -- lifecycle (soft_deleted_at IS NOT NULL). A retired delivery stop's own departure could
       -- therefore outrank the canonical active delivery's, shifting trip_end and — through it —
       -- trip duration, the insurance-allocation denominator, and net profitability after a route
       -- revision. Same soft_deleted_at IS NULL predicate this session's sibling fixes already
       -- standardized on for mdata.load_stops (dispatch-refinements.service.ts's
       -- replaceLoadStopsRefined is the write path that stamps it on archive).
       COALESCE(
         (SELECT ls.actual_departure_at
            FROM mdata.load_stops ls
           WHERE ls.load_id = l.id
             AND ls.stop_type = 'delivery'
             AND ls.actual_departure_at IS NOT NULL
             AND ls.soft_deleted_at IS NULL
           ORDER BY ls.actual_departure_at DESC
           LIMIT 1),
         l.updated_at,
         l.created_at
       ) AS trip_end,
       l.created_at AS trip_start
     FROM mdata.loads l
     WHERE l.id = $1
       AND l.operating_company_id = $2::uuid
       AND l.soft_deleted_at IS NULL
     LIMIT 1`,
    [loadId, operatingCompanyId]
  );
  if (!loadRes.rows[0]) return null;
  const base = loadRes.rows[0];
  const revenue = num(base.revenue_cents);
  const miles = num(base.miles);
  const tripStart = String(base.trip_start ?? "");
  const tripEnd = String(base.trip_end ?? "");

  // 2. Customer name
  const custRes = await client.query<{ customer_name: string | null }>(
    `SELECT c.customer_name
     FROM mdata.loads l
     LEFT JOIN mdata.customers c ON c.id = l.customer_id
                              AND c.operating_company_id = l.operating_company_id
     WHERE l.id = $1 AND l.operating_company_id = $2::uuid LIMIT 1`,
    [loadId, operatingCompanyId]
  );
  const customerName = custRes.rows[0]?.customer_name ?? null;

  // 3. Driver pay (driver_finance.driver_bills by load_id)
  const payRes = await client.query<{ driver_pay_cents: string }>(
    `SELECT COALESCE(SUM(db.gross_amount_cents), 0)::text AS driver_pay_cents
     FROM driver_finance.driver_bills db
     WHERE db.load_id = $1 AND db.operating_company_id = $2::uuid`,
    [loadId, operatingCompanyId]
  );
  const driverPay = num(payRes.rows[0]?.driver_pay_cents);

  // 4. Fuel (fuel.fuel_transactions by load_id)
  const fuelRes = await client.query<{ fuel_cents: string }>(
    `SELECT COALESCE(SUM(ROUND(ft.total_cost::numeric * 100)), 0)::text AS fuel_cents
     FROM fuel.fuel_transactions ft
     WHERE ft.load_id = $1 AND ft.operating_company_id = $2::uuid`,
    [loadId, operatingCompanyId]
  );
  const fuelCents = num(fuelRes.rows[0]?.fuel_cents);

  // 5. Maintenance (work_orders by load_id, or by unit during trip window as fallback)
  const maintRes = await client.query<{ maintenance_cents: string }>(
    `SELECT COALESCE(SUM(ROUND(COALESCE(wo.total_actual_cost, 0)::numeric * 100))::bigint, 0)::text AS maintenance_cents
     FROM maintenance.work_orders wo
     WHERE wo.load_id = $1 AND wo.operating_company_id = $2::uuid`,
    [loadId, operatingCompanyId]
  );
  const maintCents = num(maintRes.rows[0]?.maintenance_cents);

  // 6. Insurance allocation: premium ÷ active units ÷ days (estimate)
  let insuranceCents = 0;
  try {
    const insRes = await client.query<{ total_premium_cents: string; active_unit_count: string }>(
      `SELECT
         COALESCE(SUM(ip.total_premium_cents), 0)::text AS total_premium_cents,
         -- §4: mdata.units has NO operating_company_id — a unit is operated by a company when it OWNS it
         -- (owner_company_id) or LEASES it (currently_leased_to_company_id). Old u.operating_company_id 42703'd.
         GREATEST((SELECT COUNT(*)::int FROM mdata.units u WHERE (u.owner_company_id = $1 OR u.currently_leased_to_company_id = $1) AND u.deactivated_at IS NULL AND ${excludeDemoPhantomSql("u.unit_number")} AND ${excludeSampleDataSql("u.is_sample_data")}), 1)::text AS active_unit_count
       -- insurance.policy (singular): tenant-scoped via tenant_id (RLS keys on app.operating_company_id,
       -- set by the route), date column is expiry_date, status enum is active/expired/cancelled/pending
       -- (no 'bound'). The old insurance.policies / operating_company_id / expiration_date / 'bound'
       -- identifiers never existed → the query 42P01'd, was swallowed, and every profitability report
       -- silently allocated $0 insurance (overstating margin).
       FROM insurance.policy ip
       WHERE ip.tenant_id = $1
         AND ip.status = 'active'
         AND ip.effective_date <= $2::date
         AND ip.expiry_date >= $2::date`,
      [operatingCompanyId, tripEnd.slice(0, 10) || new Date().toISOString().slice(0, 10)]
    );
    if (insRes.rows[0]) {
      const annualPremium = num(insRes.rows[0].total_premium_cents);
      const unitCount = Math.max(num(insRes.rows[0].active_unit_count), 1);
      const tripDays = Math.max(
        Math.ceil((new Date(tripEnd).getTime() - new Date(tripStart).getTime()) / 86400000),
        1
      );
      insuranceCents = Math.round((annualPremium / unitCount / 365) * tripDays);
    } else {
      missSources.push("insurance");
    }
  } catch {
    missSources.push("insurance");
  }

  // 7. Factoring fee via invoice → factoring_advance
  let factoringFeeCents = 0;
  try {
    const factRes = await client.query<{ fee_cents: string }>(
      `SELECT COALESCE(SUM(fa.factor_fee_cents), 0)::text AS fee_cents
       FROM accounting.invoices inv
       -- ENTITY PREDICATE (CLS-JOIN-ENTITY-UNSCOPED): inv is scoped by the WHERE below, but the
       -- advance whose factor_fee_cents feeds this SUM was not -- a cross-entity fa would corrupt
       -- this load's profitability number.
       JOIN accounting.factoring_advances fa ON fa.id = inv.factoring_advance_id
                                             AND fa.operating_company_id = inv.operating_company_id
       WHERE inv.source_load_id = $1
         AND inv.operating_company_id = $2::uuid`,
      [loadId, operatingCompanyId]
    );
    factoringFeeCents = num(factRes.rows[0]?.fee_cents);
  } catch {
    missSources.push("factoring");
  }

  // 8. Accessorial deductions (chargebacks + toll lines)
  let accessorialCents = 0;
  try {
    const accRes = await client.query<{ acc_cents: string }>(
      `SELECT COALESCE(SUM(ac.total_chargeback_cents), 0)::text AS acc_cents
       FROM driver_finance.abandonment_chargebacks ac
       WHERE ac.load_id = $1 AND ac.operating_company_id = $2::uuid`,
      [loadId, operatingCompanyId]
    );
    accessorialCents = num(accRes.rows[0]?.acc_cents);
  } catch {
    missSources.push("accessorials");
  }

  const netProfit = revenue - driverPay - fuelCents - maintCents - insuranceCents - factoringFeeCents - accessorialCents;

  return {
    load_id: String(base.id),
    load_number: base.load_number ? String(base.load_number) : null,
    customer_name: customerName,
    status: String(base.status ?? ""),
    revenue_cents: revenue,
    driver_pay_cents: driverPay,
    fuel_cents: fuelCents,
    maintenance_cents: maintCents,
    insurance_alloc_cents: insuranceCents,
    factoring_fee_cents: factoringFeeCents,
    accessorial_deductions_cents: accessorialCents,
    net_profit_cents: netProfit,
    margin_pct: marginPct(netProfit, revenue),
    miles,
    computed_at: new Date().toISOString(),
    data_completeness: missSources.length === 0 ? "complete" : "partial",
    missing_sources: missSources,
  };
}

/**
 * Trip-level profitability — aggregates NB + SB loads per driver_settlements row.
 * Query: driver_settlements (load_bookended) in date window; sum costs across both legs.
 */
export async function computeTripProfitabilityReport(
  client: PoolClient,
  operatingCompanyId: string,
  from: string,
  to: string
): Promise<TripProfitabilityResponse> {
  const res = await client.query<Record<string, unknown>>(
    `
    WITH trips AS (
      SELECT
        s.id::text AS settlement_id,
        s.display_id::text AS settlement_display_id,
        s.driver_id::text AS driver_id,
        NULLIF(trim(CONCAT_WS(' ', d.first_name, d.last_name)), '')  AS driver_name,
        s.first_load_id::text AS nb_load_id,
        s.first_load_number::text AS nb_load_number,
        s.last_load_id::text AS sb_load_id,
        s.last_load_number::text AS sb_load_number,
        s.trip_closed_at
      FROM driver_finance.driver_settlements s
      LEFT JOIN mdata.drivers d ON d.id = s.driver_id
                             AND d.operating_company_id = s.operating_company_id
      WHERE s.operating_company_id = $1::uuid
        AND s.settlement_model = 'load_bookended'
        AND (
          s.trip_closed_at::date BETWEEN $2::date AND $3::date
          OR (s.trip_closed_at IS NULL AND s.created_at::date BETWEEN $2::date AND $3::date)
        )
    ),
    load_ids AS (
      SELECT nb_load_id AS load_id FROM trips WHERE nb_load_id IS NOT NULL
      UNION
      SELECT sb_load_id AS load_id FROM trips WHERE sb_load_id IS NOT NULL
    ),
    revenue AS (
      SELECT l.id::text AS load_id, COALESCE(l.rate_total_cents, 0)::bigint AS rev
      FROM mdata.loads l
      WHERE l.id = ANY(ARRAY(SELECT load_id::uuid FROM load_ids))
        AND l.operating_company_id = $1::uuid
    ),
    pay AS (
      SELECT db.load_id::text, COALESCE(SUM(db.gross_amount_cents), 0)::bigint AS pay
      FROM driver_finance.driver_bills db
      WHERE db.load_id = ANY(ARRAY(SELECT load_id::uuid FROM load_ids))
        AND db.operating_company_id = $1::uuid
      GROUP BY db.load_id
    ),
    fuel AS (
      SELECT ft.load_id::text, COALESCE(SUM(ROUND(ft.total_cost::numeric * 100)), 0)::bigint AS fuel
      FROM fuel.fuel_transactions ft
      WHERE ft.load_id = ANY(ARRAY(SELECT load_id::uuid FROM load_ids))
        AND ft.operating_company_id = $1::uuid
      GROUP BY ft.load_id
    ),
    maint AS (
      SELECT wo.load_id::text, COALESCE(SUM(ROUND(COALESCE(wo.total_actual_cost,0)::numeric*100))::bigint, 0) AS maint
      FROM maintenance.work_orders wo
      WHERE wo.load_id = ANY(ARRAY(SELECT load_id::uuid FROM load_ids))
        AND wo.operating_company_id = $1::uuid
      GROUP BY wo.load_id
    ),
    fact AS (
      SELECT inv.source_load_id::text AS load_id, COALESCE(SUM(fa.factor_fee_cents), 0)::bigint AS fee
      FROM accounting.invoices inv
      -- ENTITY PREDICATE (CLS-JOIN-ENTITY-UNSCOPED): same class as the single-load query above.
      JOIN accounting.factoring_advances fa ON fa.id = inv.factoring_advance_id
                                            AND fa.operating_company_id = inv.operating_company_id
      WHERE inv.source_load_id = ANY(ARRAY(SELECT load_id::uuid FROM load_ids))
        AND inv.operating_company_id = $1::uuid
      GROUP BY inv.source_load_id
    )
    SELECT
      t.settlement_id,
      t.settlement_display_id,
      t.driver_id,
      t.driver_name,
      t.nb_load_id,
      t.nb_load_number,
      t.sb_load_id,
      t.sb_load_number,
      t.trip_closed_at::text,
      -- DISPATCH-F-TRIP-PROFITABILITY-SINGLE-LOAD-DOUBLE-COUNT: a "trip" that bookends only ONE
      -- real load (no true NB+SB round trip -- s.first_load_id and s.last_load_id both point at
      -- the same load) still joined revenue/pay/fuel/maint/factoring TWICE, once via the _nb alias
      -- and once via the _sb alias, and summed both -- silently doubling every dollar figure for
      -- every single-load trip. Live-reproduced and Neon-confirmed on 3 real trips before fixing:
      -- L-20260802-0258 (rate $1.00, shown as Revenue $2.00), L-20260806-0008 (rate $1,875.50,
      -- shown as $3,751.00), L-20260824-0007 (rate $1,200.00, shown as $2,400.00) -- all exactly
      -- 2x. Driver pay was doubled the identical way (Neon: driver_bills summed to $1,105.00 for
      -- L-20260802-0258, report showed $2,210.00). Only add the _sb side when it is a genuinely
      -- DIFFERENT load from _nb.
      CASE WHEN t.sb_load_id IS NOT NULL AND t.sb_load_id != t.nb_load_id
           THEN COALESCE(r_nb.rev, 0) + COALESCE(r_sb.rev, 0)
           ELSE COALESCE(r_nb.rev, 0) END AS revenue_cents,
      CASE WHEN t.sb_load_id IS NOT NULL AND t.sb_load_id != t.nb_load_id
           THEN COALESCE(p_nb.pay, 0) + COALESCE(p_sb.pay, 0)
           ELSE COALESCE(p_nb.pay, 0) END AS driver_pay_cents,
      CASE WHEN t.sb_load_id IS NOT NULL AND t.sb_load_id != t.nb_load_id
           THEN COALESCE(f_nb.fuel, 0) + COALESCE(f_sb.fuel, 0)
           ELSE COALESCE(f_nb.fuel, 0) END AS fuel_cents,
      CASE WHEN t.sb_load_id IS NOT NULL AND t.sb_load_id != t.nb_load_id
           THEN COALESCE(m_nb.maint, 0) + COALESCE(m_sb.maint, 0)
           ELSE COALESCE(m_nb.maint, 0) END AS maintenance_cents,
      CASE WHEN t.sb_load_id IS NOT NULL AND t.sb_load_id != t.nb_load_id
           THEN COALESCE(fa_nb.fee, 0) + COALESCE(fa_sb.fee, 0)
           ELSE COALESCE(fa_nb.fee, 0) END AS factoring_fee_cents
    FROM trips t
    LEFT JOIN revenue r_nb ON r_nb.load_id = t.nb_load_id
    LEFT JOIN revenue r_sb ON r_sb.load_id = t.sb_load_id
    LEFT JOIN pay p_nb ON p_nb.load_id = t.nb_load_id
    LEFT JOIN pay p_sb ON p_sb.load_id = t.sb_load_id
    LEFT JOIN fuel f_nb ON f_nb.load_id = t.nb_load_id
    LEFT JOIN fuel f_sb ON f_sb.load_id = t.sb_load_id
    LEFT JOIN maint m_nb ON m_nb.load_id = t.nb_load_id
    LEFT JOIN maint m_sb ON m_sb.load_id = t.sb_load_id
    LEFT JOIN fact fa_nb ON fa_nb.load_id = t.nb_load_id
    LEFT JOIN fact fa_sb ON fa_sb.load_id = t.sb_load_id
    ORDER BY t.trip_closed_at DESC NULLS LAST
    `,
    [operatingCompanyId, from, to]
  );

  const rows: TripProfitabilityRow[] = (res.rows as Array<Record<string, unknown>>).map((r) => {
    const rev = num(r.revenue_cents);
    const dp = num(r.driver_pay_cents);
    const fuel = num(r.fuel_cents);
    const maint = num(r.maintenance_cents);
    const ff = num(r.factoring_fee_cents);
    const net = rev - dp - fuel - maint - ff;
    return {
      settlement_id: String(r.settlement_id),
      settlement_display_id: r.settlement_display_id ? String(r.settlement_display_id) : null,
      driver_id: r.driver_id ? String(r.driver_id) : null,
      driver_name: r.driver_name ? String(r.driver_name) : null,
      nb_load_id: r.nb_load_id ? String(r.nb_load_id) : null,
      nb_load_number: r.nb_load_number ? String(r.nb_load_number) : null,
      sb_load_id: r.sb_load_id ? String(r.sb_load_id) : null,
      sb_load_number: r.sb_load_number ? String(r.sb_load_number) : null,
      revenue_cents: rev,
      driver_pay_cents: dp,
      fuel_cents: fuel,
      maintenance_cents: maint,
      insurance_alloc_cents: 0,
      factoring_fee_cents: ff,
      accessorial_deductions_cents: 0,
      net_profit_cents: net,
      margin_pct: marginPct(net, rev),
      trip_closed_at: r.trip_closed_at ? String(r.trip_closed_at) : null,
    };
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.revenue_cents += r.revenue_cents;
      acc.driver_pay_cents += r.driver_pay_cents;
      acc.fuel_cents += r.fuel_cents;
      acc.maintenance_cents += r.maintenance_cents;
      acc.net_profit_cents += r.net_profit_cents;
      acc.trip_count += 1;
      return acc;
    },
    { revenue_cents: 0, driver_pay_cents: 0, fuel_cents: 0, maintenance_cents: 0, net_profit_cents: 0, trip_count: 0 }
  );

  return { period: { start: from, end: to }, totals, rows };
}
