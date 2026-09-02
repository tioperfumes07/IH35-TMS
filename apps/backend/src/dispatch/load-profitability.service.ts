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
  period_start: string;
  period_end: string;
  status: string;
  load_links: Array<{ id: string; label: string | null }>;
  revenue_cents: number;
  quick_pay_cents: number;
  driver_pay_cents: number;
  additional_driver_pay_cents: number;
  fuel_cents: number;
  company_expenses_cents: number;
  net_profit_cents: number;
  margin_pct: number;
  trip_closed_at: string | null;
};

export type TripProfitabilityResponse = {
  period: { start: string; end: string };
  totals: {
    revenue_cents: number;
    quick_pay_cents: number;
    driver_pay_cents: number;
    additional_driver_pay_cents: number;
    fuel_cents: number;
    company_expenses_cents: number;
    net_profit_cents: number;
    settlement_count: number;
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

export function computeCompanySettlementNetCents(input: {
  revenue_cents: number;
  quick_pay_cents: number;
  driver_pay_cents: number;
  additional_driver_pay_cents: number;
  fuel_cents: number;
  company_expenses_cents: number;
}): number {
  return input.revenue_cents
    - input.quick_pay_cents
    - input.driver_pay_cents
    - input.additional_driver_pay_cents
    - input.fuel_cents
    - input.company_expenses_cents;
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
 * Company settlement profitability — one row per settlement PERIOD, with every linked load.
 *
 * The 5753 reference covers two loads in one period. first_load_id/last_load_id are only bookend
 * conveniences; they are not the settlement grain and cannot be used as the complete load set.
 * Canonical load membership is the union of settlement-line load_id, its source driver bill's
 * load_id, and the two legacy bookends as a historical fallback. UNION makes each load count once.
 *
 * Read-only: no posting math or financial records are created here.
 */
export async function computeTripProfitabilityReport(
  client: PoolClient,
  operatingCompanyId: string,
  from: string,
  to: string
): Promise<TripProfitabilityResponse> {
  const res = await client.query<Record<string, unknown>>(
    `
    WITH settlements_in_period AS (
      SELECT
        s.id,
        s.display_id,
        s.driver_id,
        s.period_start,
        s.period_end,
        s.status,
        s.first_load_id,
        s.last_load_id,
        s.trip_closed_at
      FROM driver_finance.driver_settlements s
      WHERE s.operating_company_id = $1::uuid
        AND s.period_end BETWEEN $2::date AND $3::date
        AND s.status <> 'cancelled'
        AND s.is_sample_data = false
    ),
    settlement_loads AS (
      SELECT sip.id AS settlement_id, COALESCE(db.load_id, sl.load_id) AS load_id
      FROM settlements_in_period sip
      JOIN driver_finance.settlement_lines sl ON sl.settlement_id = sip.id
      LEFT JOIN driver_finance.driver_bills db
        ON db.id = sl.source_driver_bill_id
       AND db.operating_company_id = $1::uuid
      WHERE COALESCE(db.load_id, sl.load_id) IS NOT NULL
        AND sl.is_sample_data = false
      UNION
      SELECT id, first_load_id FROM settlements_in_period WHERE first_load_id IS NOT NULL
      UNION
      SELECT id, last_load_id FROM settlements_in_period WHERE last_load_id IS NOT NULL
    ),
    settlement_lines AS (
      SELECT
        sl.settlement_id,
        COALESCE(SUM(ROUND(sl.amount * 100)) FILTER (
          WHERE sl.line_type IN ('earnings', 'team_split_primary', 'team_split_secondary')
        ), 0)::bigint AS driver_pay_cents,
        COALESCE(SUM(ROUND(sl.amount * 100)) FILTER (WHERE sl.line_type = 'extra_pay'), 0)::bigint
          AS additional_driver_pay_cents
      FROM driver_finance.settlement_lines sl
      JOIN settlements_in_period sip ON sip.id = sl.settlement_id
      WHERE sl.is_sample_data = false
      GROUP BY sl.settlement_id
    ),
    load_rollup AS (
      SELECT
        sl.settlement_id,
        COALESCE(
          jsonb_agg(jsonb_build_object('id', l.id::text, 'label', l.load_number::text)
                    ORDER BY l.load_number),
          '[]'::jsonb
        ) AS load_links,
        COALESCE(SUM(l.rate_total_cents), 0)::bigint AS revenue_cents,
        COALESCE(SUM(l.miles_practical), 0)::numeric AS miles
      FROM settlement_loads sl
      JOIN mdata.loads l
        ON l.id = sl.load_id
       AND l.operating_company_id = $1::uuid
       AND l.soft_deleted_at IS NULL
       AND l.is_sample_data = false
      GROUP BY sl.settlement_id
    ),
    quick_pay AS (
      SELECT sl.settlement_id, COALESCE(SUM(fa.factor_fee_cents), 0)::bigint AS quick_pay_cents
      FROM settlement_loads sl
      JOIN accounting.invoices inv
        ON inv.source_load_id = sl.load_id
       AND inv.operating_company_id = $1::uuid
       AND inv.status <> 'void'
       AND inv.is_sample_data = false
      JOIN accounting.factoring_advances fa
        ON fa.id = inv.factoring_advance_id
       AND fa.operating_company_id = inv.operating_company_id
      GROUP BY sl.settlement_id
    ),
    fuel_cost AS (
      SELECT sl.settlement_id,
             COALESCE(SUM(ROUND(ft.total_cost::numeric * 100)), 0)::bigint AS fuel_cents
      FROM settlement_loads sl
      JOIN fuel.fuel_transactions ft
        ON ft.load_id = sl.load_id
       AND ft.operating_company_id = $1::uuid
      GROUP BY sl.settlement_id
    ),
    company_expenses AS (
      SELECT sl.settlement_id,
             COALESCE(SUM(e.total_amount_cents), 0)::bigint AS company_expenses_cents
      FROM settlement_loads sl
      JOIN accounting.expenses e
        ON e.load_id = sl.load_id
       AND e.operating_company_id = $1::uuid
       AND e.status = 'posted'
       AND e.is_active = true
       AND e.deleted_at IS NULL
       AND e.is_sample_data = false
      GROUP BY sl.settlement_id
    )
    SELECT
      sip.id::text AS settlement_id,
      sip.display_id::text AS settlement_display_id,
      sip.driver_id::text AS driver_id,
      NULLIF(trim(CONCAT_WS(' ', d.first_name, d.last_name)), '') AS driver_name,
      sip.period_start::text,
      sip.period_end::text,
      sip.status,
      COALESCE(lr.load_links, '[]'::jsonb) AS load_links,
      COALESCE(lr.revenue_cents, 0)::bigint AS revenue_cents,
      COALESCE(qp.quick_pay_cents, 0)::bigint AS quick_pay_cents,
      COALESCE(sln.driver_pay_cents, 0)::bigint AS driver_pay_cents,
      COALESCE(sln.additional_driver_pay_cents, 0)::bigint AS additional_driver_pay_cents,
      COALESCE(fc.fuel_cents, 0)::bigint AS fuel_cents,
      COALESCE(ce.company_expenses_cents, 0)::bigint AS company_expenses_cents,
      sip.trip_closed_at::text
    FROM settlements_in_period sip
    LEFT JOIN mdata.drivers d
      ON d.id = sip.driver_id
     AND d.operating_company_id = $1::uuid
    LEFT JOIN load_rollup lr ON lr.settlement_id = sip.id
    LEFT JOIN settlement_lines sln ON sln.settlement_id = sip.id
    LEFT JOIN quick_pay qp ON qp.settlement_id = sip.id
    LEFT JOIN fuel_cost fc ON fc.settlement_id = sip.id
    LEFT JOIN company_expenses ce ON ce.settlement_id = sip.id
    ORDER BY sip.period_end DESC, sip.display_id DESC
    `,
    [operatingCompanyId, from, to]
  );

  const rows: TripProfitabilityRow[] = (res.rows as Array<Record<string, unknown>>).map((r) => {
    const rev = num(r.revenue_cents);
    const quickPay = num(r.quick_pay_cents);
    const dp = num(r.driver_pay_cents);
    const additionalPay = num(r.additional_driver_pay_cents);
    const fuel = num(r.fuel_cents);
    const companyExpenses = num(r.company_expenses_cents);
    const net = computeCompanySettlementNetCents({
      revenue_cents: rev,
      quick_pay_cents: quickPay,
      driver_pay_cents: dp,
      additional_driver_pay_cents: additionalPay,
      fuel_cents: fuel,
      company_expenses_cents: companyExpenses,
    });
    const rawLoadLinks = Array.isArray(r.load_links) ? r.load_links : [];
    return {
      settlement_id: String(r.settlement_id),
      settlement_display_id: r.settlement_display_id ? String(r.settlement_display_id) : null,
      driver_id: r.driver_id ? String(r.driver_id) : null,
      driver_name: r.driver_name ? String(r.driver_name) : null,
      period_start: String(r.period_start),
      period_end: String(r.period_end),
      status: String(r.status),
      load_links: rawLoadLinks.map((link) => {
        const value = link as Record<string, unknown>;
        return { id: String(value.id), label: value.label == null ? null : String(value.label) };
      }),
      revenue_cents: rev,
      quick_pay_cents: quickPay,
      driver_pay_cents: dp,
      additional_driver_pay_cents: additionalPay,
      fuel_cents: fuel,
      company_expenses_cents: companyExpenses,
      net_profit_cents: net,
      margin_pct: marginPct(net, rev),
      trip_closed_at: r.trip_closed_at ? String(r.trip_closed_at) : null,
    };
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.revenue_cents += r.revenue_cents;
      acc.quick_pay_cents += r.quick_pay_cents;
      acc.driver_pay_cents += r.driver_pay_cents;
      acc.additional_driver_pay_cents += r.additional_driver_pay_cents;
      acc.fuel_cents += r.fuel_cents;
      acc.company_expenses_cents += r.company_expenses_cents;
      acc.net_profit_cents += r.net_profit_cents;
      acc.settlement_count += 1;
      return acc;
    },
    {
      revenue_cents: 0,
      quick_pay_cents: 0,
      driver_pay_cents: 0,
      additional_driver_pay_cents: 0,
      fuel_cents: 0,
      company_expenses_cents: 0,
      net_profit_cents: 0,
      settlement_count: 0,
    }
  );

  return { period: { start: from, end: to }, totals, rows };
}
