export type PerTruckCpmRow = {
  unit_uuid: string;
  display_id: string;
  miles: number;
  total_cost_cents: number;
  cpm_cents: number;
  rank: number;
};

export type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Per-unit cost-per-mile for the period. Allocation mirrors profit-per-truck extended
 * mode: driver pay (settlement bills), fuel transactions, maintenance WOs, plus
 * period-proportional insurance + permit costs when tagged to the unit.
 */
export async function calculatePerTruckCpm(
  client: Queryable,
  operatingCompanyId: string,
  from: string,
  to: string
): Promise<PerTruckCpmRow[]> {
  const res = await client.query(
    `
      WITH load_scope AS (
        SELECT
          l.id,
          l.assigned_unit_id,
          COALESCE(l.miles_practical, l.miles_shortest, 0)::bigint AS trip_miles
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
      driver_pay AS (
        SELECT ls.assigned_unit_id AS unit_id, COALESCE(SUM(db.gross_amount_cents), 0)::bigint AS cents
        FROM driver_finance.driver_bills db
        JOIN load_scope ls ON ls.id = db.load_id
        GROUP BY ls.assigned_unit_id
      ),
      fuel AS (
        SELECT l.assigned_unit_id AS unit_id,
               COALESCE(SUM(ROUND(ft.total_cost::numeric * 100)), 0)::bigint AS cents
        FROM fuel.fuel_transactions ft
        JOIN load_scope l ON l.id = ft.load_id
        WHERE ft.operating_company_id = $1::uuid
        GROUP BY l.assigned_unit_id
      ),
      maint AS (
        SELECT wo.unit_id,
               COALESCE(
                 SUM(
                   CASE
                     WHEN COALESCE(wo.updated_at, wo.opened_at)::date BETWEEN $2::date AND $3::date
                     THEN ROUND(COALESCE(wo.total_actual_cost, 0)::numeric * 100)::bigint
                     ELSE 0
                   END
                 ),
                 0
               )::bigint AS cents
        FROM maintenance.work_orders wo
        WHERE wo.operating_company_id = $1::uuid
        GROUP BY wo.unit_id
      ),
      insurance AS (
        -- PER-TRUCK INSURANCE COST = 0 (permanent until the follow-up block, not a stub/swallow).
        -- The unit-keyed insurance.insurance_policy_units / insurance.insurance_policies this query assumed
        -- NEVER existed in any migration -> Postgres 42P01 -> the whole report 500'd. The REAL schema is
        -- insurance.policy + insurance.policy_unit, which is ASSET-keyed (asset_id -> mdata.assets), with a
        -- policy-level total_premium_cents (not per-unit annual), tenant_id, and status (no cancelled_at).
        -- Real per-truck insurance (policy -> policy_unit(asset) -> unit + premium allocation by
        -- insured_value_cents share + policy-term annualization) is a separate [HOLD-FOR-JORGE] follow-up.
        -- Until then insurance contributes 0 so reports/per-truck-cpm returns 200 (honest 0).
        SELECT NULL::uuid AS unit_id, 0::bigint AS cents WHERE false
      ),
      permits AS (
        -- REPOINTED to the REAL master_data.unit_permits schema (migration 0407_permits_toll_tags):
        -- the unit FK is unit_uuid (NOT unit_id) and the cost column is cost numeric(8,2) in DOLLARS
        -- (NOT annual_cost_cents). The prior column names never existed -> Postgres 42703 -> the whole
        -- report 500'd. Per-truck permit cost = each permit's cost (dollars->cents) pro-rated per-day over
        -- its own validity term (effective_date..expiration_date), times the report-range days; summed per
        -- unit. Permits are cleanly unit-keyed (unit_uuid -> mdata.units), so this is a real number.
        SELECT up.unit_uuid AS unit_id,
               COALESCE(
                 SUM(
                   ROUND(
                     (COALESCE(up.cost, 0) * 100)::numeric
                     / GREATEST(1, (up.expiration_date - up.effective_date + 1))
                     * GREATEST(1, ($3::date - $2::date + 1))
                   )
                 ),
                 0
               )::bigint AS cents
        FROM master_data.unit_permits up
        WHERE up.operating_company_id = $1::uuid
          AND up.deleted_at IS NULL
        GROUP BY up.unit_uuid
      )
      SELECT
        u.id::text AS unit_uuid,
        u.unit_number AS display_id,
        COALESCE(m.miles, 0)::text AS miles,
        (
          COALESCE(dp.cents, 0) + COALESCE(f.cents, 0) + COALESCE(mt.cents, 0)
          + COALESCE(ins.cents, 0) + COALESCE(p.cents, 0)
        )::text AS total_cost_cents
      FROM mdata.units u
      JOIN miles m ON m.unit_id = u.id
      LEFT JOIN driver_pay dp ON dp.unit_id = u.id
      LEFT JOIN fuel f ON f.unit_id = u.id
      LEFT JOIN maint mt ON mt.unit_id = u.id
      LEFT JOIN insurance ins ON ins.unit_id = u.id
      LEFT JOIN permits p ON p.unit_id = u.id
      WHERE u.deactivated_at IS NULL
      ORDER BY u.unit_number
    `,
    [operatingCompanyId, from, to]
  );

  const rows: PerTruckCpmRow[] = res.rows.map((row) => {
    const miles = num(row.miles);
    const totalCost = num(row.total_cost_cents);
    const cpmCents = miles > 0 ? Math.round(totalCost / miles) : 0;
    return {
      unit_uuid: String(row.unit_uuid),
      display_id: String(row.display_id ?? ""),
      miles,
      total_cost_cents: totalCost,
      cpm_cents: cpmCents,
      rank: 0,
    };
  });

  rows.sort((a, b) => a.cpm_cents - b.cpm_cents);
  rows.forEach((row, idx) => {
    row.rank = idx + 1;
  });
  return rows;
}
