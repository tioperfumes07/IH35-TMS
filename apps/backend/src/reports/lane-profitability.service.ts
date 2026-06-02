import type { PoolClient } from "pg";

export type LaneSummary = {
  origin_city: string;
  origin_state: string;
  destination_city: string;
  destination_state: string;
  load_count: number;
  total_revenue_cents: number;
  total_fuel_cost_cents: number;
  total_driver_pay_cents: number;
  total_maintenance_cost_cents: number;
  total_miles: number;
  gross_profit_cents: number;
  profit_per_mile_cents: number | null;
  profit_per_load_cents: number | null;
  margin_pct: number | null;
  avg_deadhead_pct: number | null;
  last_load_date: string | null;
};

export type LaneLoadDetail = {
  load_id: string;
  load_number: string | null;
  created_at: string;
  revenue_cents: number;
  driver_pay_cents: number;
  fuel_cost_cents: number;
  maintenance_cost_cents: number;
  gross_profit_cents: number;
  miles: number;
  margin_pct: number | null;
};

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const LANE_COMPUTE_SQL = `
  WITH pickup AS (
    SELECT DISTINCT ON (ls.load_id)
      ls.load_id,
      NULLIF(trim(ls.city), '') AS origin_city,
      NULLIF(trim(ls.state), '') AS origin_state
    FROM mdata.load_stops ls
    WHERE ls.stop_type = 'pickup'
    ORDER BY ls.load_id, ls.sequence_number ASC
  ),
  delivery AS (
    SELECT DISTINCT ON (ls.load_id)
      ls.load_id,
      NULLIF(trim(ls.city), '') AS destination_city,
      NULLIF(trim(ls.state), '') AS destination_state
    FROM mdata.load_stops ls
    WHERE ls.stop_type = 'delivery'
    ORDER BY ls.load_id, ls.sequence_number DESC
  ),
  load_scope AS (
    SELECT
      l.id,
      p.origin_city,
      p.origin_state,
      d.destination_city,
      d.destination_state,
      COALESCE(l.rate_total_cents, 0)::bigint AS revenue_cents,
      COALESCE(l.miles_practical, l.miles_shortest, 0)::bigint AS trip_miles,
      COALESCE(l.loaded_miles, l.miles_practical, l.miles_shortest, 0)::bigint AS loaded_miles,
      COALESCE(l.deadhead_miles_to_pickup, l.miles_deadhead, 0)::bigint AS deadhead_miles,
      l.created_at::date AS load_date
    FROM mdata.loads l
    JOIN pickup p ON p.load_id = l.id
    JOIN delivery d ON d.load_id = l.id
    WHERE l.operating_company_id = $1
      AND l.soft_deleted_at IS NULL
      AND l.created_at::date BETWEEN $2::date AND $3::date
      AND p.origin_city IS NOT NULL
      AND p.origin_state IS NOT NULL
      AND d.destination_city IS NOT NULL
      AND d.destination_state IS NOT NULL
  ),
  agg AS (
    SELECT
      ls.origin_city,
      ls.origin_state,
      ls.destination_city,
      ls.destination_state,
      COUNT(*)::int AS load_count,
      COALESCE(SUM(ls.revenue_cents), 0)::bigint AS total_revenue_cents,
      COALESCE(SUM(ls.trip_miles), 0)::bigint AS total_miles,
      MAX(ls.load_date) AS last_load_date,
      CASE
        WHEN SUM(ls.loaded_miles + ls.deadhead_miles) > 0
        THEN ROUND((SUM(ls.deadhead_miles)::numeric / SUM(ls.loaded_miles + ls.deadhead_miles)::numeric) * 100, 2)
        ELSE NULL
      END AS avg_deadhead_pct
    FROM load_scope ls
    GROUP BY ls.origin_city, ls.origin_state, ls.destination_city, ls.destination_state
  ),
  pay AS (
    SELECT
      ls.origin_city,
      ls.origin_state,
      ls.destination_city,
      ls.destination_state,
      COALESCE(SUM(db.gross_amount_cents), 0)::bigint AS driver_pay_cents
    FROM driver_finance.driver_bills db
    JOIN load_scope ls ON ls.id = db.load_id
    WHERE db.operating_company_id = $1
    GROUP BY ls.origin_city, ls.origin_state, ls.destination_city, ls.destination_state
  ),
  maint AS (
    SELECT
      ls.origin_city,
      ls.origin_state,
      ls.destination_city,
      ls.destination_state,
      COALESCE(
        SUM(ROUND(COALESCE(wo.total_actual_cost, 0)::numeric * 100)::bigint),
        0
      )::bigint AS maintenance_cents
    FROM maintenance.work_orders wo
    JOIN load_scope ls ON ls.id = wo.load_id
    WHERE wo.operating_company_id = $1
    GROUP BY ls.origin_city, ls.origin_state, ls.destination_city, ls.destination_state
  ),
  fuel AS (
    SELECT
      ls.origin_city,
      ls.origin_state,
      ls.destination_city,
      ls.destination_state,
      COALESCE(SUM(ROUND(ft.total_cost::numeric * 100)), 0)::bigint AS fuel_cents
    FROM fuel.fuel_transactions ft
    JOIN load_scope ls ON ls.id = ft.load_id
    WHERE ft.operating_company_id = $1
    GROUP BY ls.origin_city, ls.origin_state, ls.destination_city, ls.destination_state
  )
  SELECT
    agg.origin_city,
    agg.origin_state,
    agg.destination_city,
    agg.destination_state,
    agg.load_count,
    agg.total_revenue_cents,
    COALESCE(fuel.fuel_cents, 0)::bigint AS total_fuel_cost_cents,
    COALESCE(pay.driver_pay_cents, 0)::bigint AS total_driver_pay_cents,
    COALESCE(maint.maintenance_cents, 0)::bigint AS total_maintenance_cost_cents,
    agg.total_miles,
    (
      agg.total_revenue_cents
      - COALESCE(pay.driver_pay_cents, 0)
      - COALESCE(fuel.fuel_cents, 0)
      - COALESCE(maint.maintenance_cents, 0)
    )::bigint AS gross_profit_cents,
    CASE
      WHEN agg.total_miles > 0
      THEN ROUND(
        (
          agg.total_revenue_cents
          - COALESCE(pay.driver_pay_cents, 0)
          - COALESCE(fuel.fuel_cents, 0)
          - COALESCE(maint.maintenance_cents, 0)
        )::numeric / agg.total_miles::numeric
      )::int
      ELSE NULL
    END AS profit_per_mile_cents,
    CASE
      WHEN agg.load_count > 0
      THEN ROUND(
        (
          agg.total_revenue_cents
          - COALESCE(pay.driver_pay_cents, 0)
          - COALESCE(fuel.fuel_cents, 0)
          - COALESCE(maint.maintenance_cents, 0)
        )::numeric / agg.load_count::numeric
      )::bigint
      ELSE NULL
    END AS profit_per_load_cents,
    CASE
      WHEN agg.total_revenue_cents > 0
      THEN ROUND(
        (
          (
            agg.total_revenue_cents
            - COALESCE(pay.driver_pay_cents, 0)
            - COALESCE(fuel.fuel_cents, 0)
            - COALESCE(maint.maintenance_cents, 0)
          )::numeric / agg.total_revenue_cents::numeric
        ) * 100,
        2
      )
      ELSE NULL
    END AS margin_pct,
    agg.avg_deadhead_pct,
    agg.last_load_date::text AS last_load_date
  FROM agg
  LEFT JOIN pay
    ON pay.origin_city = agg.origin_city
    AND pay.origin_state = agg.origin_state
    AND pay.destination_city = agg.destination_city
    AND pay.destination_state = agg.destination_state
  LEFT JOIN maint
    ON maint.origin_city = agg.origin_city
    AND maint.origin_state = agg.origin_state
    AND maint.destination_city = agg.destination_city
    AND maint.destination_state = agg.destination_state
  LEFT JOIN fuel
    ON fuel.origin_city = agg.origin_city
    AND fuel.origin_state = agg.origin_state
    AND fuel.destination_city = agg.destination_city
    AND fuel.destination_state = agg.destination_state
  ORDER BY gross_profit_cents DESC
`;

function mapLaneRow(row: Record<string, unknown>): LaneSummary {
  return {
    origin_city: String(row.origin_city),
    origin_state: String(row.origin_state),
    destination_city: String(row.destination_city),
    destination_state: String(row.destination_state),
    load_count: num(row.load_count),
    total_revenue_cents: num(row.total_revenue_cents),
    total_fuel_cost_cents: num(row.total_fuel_cost_cents),
    total_driver_pay_cents: num(row.total_driver_pay_cents),
    total_maintenance_cost_cents: num(row.total_maintenance_cost_cents),
    total_miles: num(row.total_miles),
    gross_profit_cents: num(row.gross_profit_cents),
    profit_per_mile_cents: row.profit_per_mile_cents != null ? num(row.profit_per_mile_cents) : null,
    profit_per_load_cents: row.profit_per_load_cents != null ? num(row.profit_per_load_cents) : null,
    margin_pct: row.margin_pct != null ? num(row.margin_pct) : null,
    avg_deadhead_pct: row.avg_deadhead_pct != null ? num(row.avg_deadhead_pct) : null,
    last_load_date: row.last_load_date ? String(row.last_load_date) : null,
  };
}

export async function computeLaneProfitability(
  client: PoolClient,
  operatingCompanyId: string,
  periodStart: string,
  periodEnd: string
): Promise<LaneSummary[]> {
  const res = await client.query(LANE_COMPUTE_SQL, [operatingCompanyId, periodStart, periodEnd]);
  return res.rows.map((row) => mapLaneRow(row as Record<string, unknown>));
}

export async function refreshLaneProfitabilityCache(
  client: PoolClient,
  operatingCompanyId: string,
  periodStart: string,
  periodEnd: string
): Promise<number> {
  const lanes = await computeLaneProfitability(client, operatingCompanyId, periodStart, periodEnd);
  await client.query(
    `
      DELETE FROM reports.lane_profitability_cache
      WHERE operating_company_id = $1::uuid
        AND period_start = $2::date
        AND period_end = $3::date
    `,
    [operatingCompanyId, periodStart, periodEnd]
  );

  for (const lane of lanes) {
    await client.query(
      `
        INSERT INTO reports.lane_profitability_cache (
          operating_company_id,
          origin_city,
          origin_state,
          destination_city,
          destination_state,
          period_start,
          period_end,
          load_count,
          total_revenue_cents,
          total_fuel_cost_cents,
          total_driver_pay_cents,
          total_maintenance_cost_cents,
          total_miles,
          gross_profit_cents,
          profit_per_mile_cents,
          profit_per_load_cents,
          margin_pct,
          avg_deadhead_pct,
          last_load_date,
          computed_at
        )
        VALUES (
          $1::uuid, $2, $3, $4, $5, $6::date, $7::date,
          $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::date, NOW()
        )
        ON CONFLICT (
          operating_company_id,
          origin_city,
          origin_state,
          destination_city,
          destination_state,
          period_start,
          period_end
        )
        DO UPDATE SET
          load_count = EXCLUDED.load_count,
          total_revenue_cents = EXCLUDED.total_revenue_cents,
          total_fuel_cost_cents = EXCLUDED.total_fuel_cost_cents,
          total_driver_pay_cents = EXCLUDED.total_driver_pay_cents,
          total_maintenance_cost_cents = EXCLUDED.total_maintenance_cost_cents,
          total_miles = EXCLUDED.total_miles,
          gross_profit_cents = EXCLUDED.gross_profit_cents,
          profit_per_mile_cents = EXCLUDED.profit_per_mile_cents,
          profit_per_load_cents = EXCLUDED.profit_per_load_cents,
          margin_pct = EXCLUDED.margin_pct,
          avg_deadhead_pct = EXCLUDED.avg_deadhead_pct,
          last_load_date = EXCLUDED.last_load_date,
          computed_at = NOW()
      `,
      [
        operatingCompanyId,
        lane.origin_city,
        lane.origin_state,
        lane.destination_city,
        lane.destination_state,
        periodStart,
        periodEnd,
        lane.load_count,
        lane.total_revenue_cents,
        lane.total_fuel_cost_cents,
        lane.total_driver_pay_cents,
        lane.total_maintenance_cost_cents,
        lane.total_miles,
        lane.gross_profit_cents,
        lane.profit_per_mile_cents,
        lane.profit_per_load_cents,
        lane.margin_pct,
        lane.avg_deadhead_pct,
        lane.last_load_date,
      ]
    );
  }

  await client.query(`SELECT reports.refresh_lane_metrics_monthly()`).catch(() => undefined);

  return lanes.length;
}

export async function readLaneProfitabilityCache(
  client: PoolClient,
  operatingCompanyId: string,
  periodStart: string,
  periodEnd: string
): Promise<{ lanes: LaneSummary[]; computed_at: string | null; stale: boolean }> {
  const res = await client.query(
    `
      SELECT
        origin_city,
        origin_state,
        destination_city,
        destination_state,
        load_count,
        total_revenue_cents,
        total_fuel_cost_cents,
        total_driver_pay_cents,
        total_maintenance_cost_cents,
        total_miles,
        gross_profit_cents,
        profit_per_mile_cents,
        profit_per_load_cents,
        margin_pct,
        avg_deadhead_pct,
        last_load_date::text AS last_load_date,
        MAX(computed_at) OVER () AS latest_computed_at
      FROM reports.lane_profitability_cache
      WHERE operating_company_id = $1::uuid
        AND period_start = $2::date
        AND period_end = $3::date
      ORDER BY gross_profit_cents DESC
    `,
    [operatingCompanyId, periodStart, periodEnd]
  );

  const rows = res.rows as Array<Record<string, unknown>>;
  if (rows.length === 0) {
    return { lanes: [], computed_at: null, stale: true };
  }

  const computedAt = rows[0].latest_computed_at ? String(rows[0].latest_computed_at) : null;
  const stale =
    !computedAt || Date.now() - new Date(computedAt).getTime() > 24 * 60 * 60 * 1000;

  return {
    lanes: rows.map((row) => mapLaneRow(row)),
    computed_at: computedAt,
    stale,
  };
}

export async function getLaneLoadDetails(
  client: PoolClient,
  operatingCompanyId: string,
  periodStart: string,
  periodEnd: string,
  originCity: string,
  originState: string,
  destinationCity: string,
  destinationState: string,
  limit = 20
): Promise<LaneLoadDetail[]> {
  const res = await client.query(
    `
      WITH pickup AS (
        SELECT DISTINCT ON (ls.load_id)
          ls.load_id,
          NULLIF(trim(ls.city), '') AS origin_city,
          NULLIF(trim(ls.state), '') AS origin_state
        FROM mdata.load_stops ls
        WHERE ls.stop_type = 'pickup'
        ORDER BY ls.load_id, ls.sequence_number ASC
      ),
      delivery AS (
        SELECT DISTINCT ON (ls.load_id)
          ls.load_id,
          NULLIF(trim(ls.city), '') AS destination_city,
          NULLIF(trim(ls.state), '') AS destination_state
        FROM mdata.load_stops ls
        WHERE ls.stop_type = 'delivery'
        ORDER BY ls.load_id, ls.sequence_number DESC
      ),
      load_scope AS (
        SELECT
          l.id,
          l.load_number,
          l.created_at,
          COALESCE(l.rate_total_cents, 0)::bigint AS revenue_cents,
          COALESCE(l.miles_practical, l.miles_shortest, 0)::bigint AS trip_miles
        FROM mdata.loads l
        JOIN pickup p ON p.load_id = l.id
        JOIN delivery d ON d.load_id = l.id
        WHERE l.operating_company_id = $1
          AND l.soft_deleted_at IS NULL
          AND l.created_at::date BETWEEN $2::date AND $3::date
          AND LOWER(p.origin_city) = LOWER($4)
          AND LOWER(p.origin_state) = LOWER($5)
          AND LOWER(d.destination_city) = LOWER($6)
          AND LOWER(d.destination_state) = LOWER($7)
      ),
      pay AS (
        SELECT ls.id AS load_id, COALESCE(SUM(db.gross_amount_cents), 0)::bigint AS driver_pay_cents
        FROM driver_finance.driver_bills db
        JOIN load_scope ls ON ls.id = db.load_id
        GROUP BY ls.id
      ),
      maint AS (
        SELECT ls.id AS load_id, COALESCE(SUM(ROUND(COALESCE(wo.total_actual_cost, 0)::numeric * 100)::bigint), 0)::bigint AS maintenance_cents
        FROM maintenance.work_orders wo
        JOIN load_scope ls ON ls.id = wo.load_id
        GROUP BY ls.id
      ),
      fuel AS (
        SELECT ls.id AS load_id, COALESCE(SUM(ROUND(ft.total_cost::numeric * 100)), 0)::bigint AS fuel_cents
        FROM fuel.fuel_transactions ft
        JOIN load_scope ls ON ls.id = ft.load_id
        GROUP BY ls.id
      )
      SELECT
        ls.id::text AS load_id,
        ls.load_number,
        ls.created_at::text AS created_at,
        ls.revenue_cents,
        COALESCE(pay.driver_pay_cents, 0)::bigint AS driver_pay_cents,
        COALESCE(fuel.fuel_cents, 0)::bigint AS fuel_cost_cents,
        COALESCE(maint.maintenance_cents, 0)::bigint AS maintenance_cost_cents,
        (
          ls.revenue_cents
          - COALESCE(pay.driver_pay_cents, 0)
          - COALESCE(fuel.fuel_cents, 0)
          - COALESCE(maint.maintenance_cents, 0)
        )::bigint AS gross_profit_cents,
        ls.trip_miles AS miles,
        CASE
          WHEN ls.revenue_cents > 0
          THEN ROUND(
            (
              (
                ls.revenue_cents
                - COALESCE(pay.driver_pay_cents, 0)
                - COALESCE(fuel.fuel_cents, 0)
                - COALESCE(maint.maintenance_cents, 0)
              )::numeric / ls.revenue_cents::numeric
            ) * 100,
            2
          )
          ELSE NULL
        END AS margin_pct
      FROM load_scope ls
      LEFT JOIN pay ON pay.load_id = ls.id
      LEFT JOIN maint ON maint.load_id = ls.id
      LEFT JOIN fuel ON fuel.load_id = ls.id
      ORDER BY ls.created_at DESC
      LIMIT $8
    `,
    [operatingCompanyId, periodStart, periodEnd, originCity, originState, destinationCity, destinationState, limit]
  );

  return res.rows.map((row) => ({
    load_id: String(row.load_id),
    load_number: row.load_number != null ? String(row.load_number) : null,
    created_at: String(row.created_at),
    revenue_cents: num(row.revenue_cents),
    driver_pay_cents: num(row.driver_pay_cents),
    fuel_cost_cents: num(row.fuel_cost_cents),
    maintenance_cost_cents: num(row.maintenance_cost_cents),
    gross_profit_cents: num(row.gross_profit_cents),
    miles: num(row.miles),
    margin_pct: row.margin_pct != null ? round2(num(row.margin_pct)) : null,
  }));
}

export function resolveLanePeriod(
  period: "YTD" | "quarter" | "month" | "custom",
  customStart?: string,
  customEnd?: string
): { start: string; end: string } {
  const now = new Date();
  const end = customEnd ?? now.toISOString().slice(0, 10);

  if (period === "custom" && customStart && customEnd) {
    return { start: customStart, end: customEnd };
  }
  if (period === "month") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    return { start: start.toISOString().slice(0, 10), end: monthEnd.toISOString().slice(0, 10) };
  }
  if (period === "quarter") {
    const q = Math.floor(now.getUTCMonth() / 3);
    const startMonth = q === 0 ? 9 : (q - 1) * 3;
    const year = q === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
    const start = new Date(Date.UTC(year, startMonth, 1));
    const endDate = new Date(Date.UTC(year, startMonth + 3, 0));
    return { start: start.toISOString().slice(0, 10), end: endDate.toISOString().slice(0, 10) };
  }
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  return { start: start.toISOString().slice(0, 10), end };
}

export async function refreshLaneProfitabilityLast12Months(
  client: PoolClient,
  operatingCompanyId: string
): Promise<number> {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const start = startDate.toISOString().slice(0, 10);
  return refreshLaneProfitabilityCache(client, operatingCompanyId, start, end);
}
