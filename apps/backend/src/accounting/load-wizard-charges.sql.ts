/**
 * ROUND 285.4.4 — wizard amounts live in dispatch.load_charge_lines (Book Load / Edit Load).
 * Codes written by book-load.service.ts: linehaul + fuel_surcharge as system; everything else
 * accessorial (including detention / layover when chosen from the additional-charge catalog).
 *
 * ONE pivot, shared by load-costs-board + load-cost-rollup so DispatchLoadCostsPanel and
 * LoadCostsBoardPage never invent a second formula.
 */
export function wizardChargesAggregateSelect(alias = "wiz"): string {
  return `
              COALESCE(${alias}.linehaul_cents, 0)::bigint AS wizard_linehaul_cents,
              COALESCE(${alias}.fuel_surcharge_cents, 0)::bigint AS wizard_fuel_surcharge_cents,
              COALESCE(${alias}.accessorial_cents, 0)::bigint AS wizard_accessorial_cents,
              COALESCE(${alias}.detention_charge_cents, 0)::bigint AS wizard_detention_cents,
              COALESCE(${alias}.layover_charge_cents, 0)::bigint AS wizard_layover_cents`;
}

/** LEFT JOIN of the per-load pivot. `loadIdExpr` / `companyExpr` are internal SQL refs only. */
export function wizardChargesLeftJoin(loadIdExpr: string, companyExpr: string, alias = "wiz"): string {
  // ALIAS NOTE: the inner table is aliased `wcl`, never `cl` — load-cost-rollup.sql.ts calls this
  // with the OUTER alias `cl` ("cl.id"), and an inner `cl` would shadow it so `cl.load_id = cl.id`
  // would silently self-reference instead of correlating. Found while fixing LOADCOSTS-500.
  // LOADCOSTS-500 (Lead, 09-30-2026). This was a PLAIN `LEFT JOIN ( ... )` whose subquery body
  // filtered on `${companyExpr}` — which callers pass as `l.operating_company_id`, an OUTER alias.
  // A non-lateral subquery may not reference the outer FROM clause, so Postgres rejected the whole
  // statement at PARSE time with 42P01 "invalid reference to FROM-clause entry for table l ... you
  // must mark this subquery with LATERAL". The Load Costs board therefore returned HTTP 500 in
  // ~40ms and rendered 0 loads / $0.00 for every tile, live, from the moment #23239 merged.
  // LATERAL is the correct form here: it also lets the per-load filter move INSIDE, so this becomes
  // a one-row correlated lookup per load instead of aggregating every charge line in the company
  // and then joining. Aggregates over zero matching rows return NULL and the callers' COALESCE
  // turns them into 0, so `ON true` keeps the LEFT-JOIN semantics the callers already rely on.
  return `LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(wcl.amount_cents) FILTER (
               WHERE lower(wcl.charge_code) IN ('linehaul', 'line_haul')
             ), 0)::bigint AS linehaul_cents,
             COALESCE(SUM(wcl.amount_cents) FILTER (
               WHERE lower(wcl.charge_code) IN ('fuel_surcharge', 'fsc')
             ), 0)::bigint AS fuel_surcharge_cents,
             COALESCE(SUM(wcl.amount_cents) FILTER (
               WHERE lower(wcl.charge_code) LIKE '%detention%'
                  OR lower(COALESCE(wcl.description, '')) LIKE '%detention%'
             ), 0)::bigint AS detention_charge_cents,
             COALESCE(SUM(wcl.amount_cents) FILTER (
               WHERE lower(wcl.charge_code) LIKE '%layover%'
                  OR lower(COALESCE(wcl.description, '')) LIKE '%layover%'
             ), 0)::bigint AS layover_charge_cents,
             COALESCE(SUM(wcl.amount_cents) FILTER (
               WHERE lower(wcl.charge_code) NOT IN ('linehaul', 'line_haul', 'fuel_surcharge', 'fsc')
                 AND lower(wcl.charge_code) NOT LIKE '%detention%'
                 AND lower(wcl.charge_code) NOT LIKE '%layover%'
                 AND lower(COALESCE(wcl.description, '')) NOT LIKE '%detention%'
                 AND lower(COALESCE(wcl.description, '')) NOT LIKE '%layover%'
             ), 0)::bigint AS accessorial_cents
        FROM dispatch.load_charge_lines wcl
       WHERE wcl.load_id = ${loadIdExpr}
         AND wcl.operating_company_id = ${companyExpr}
         AND COALESCE(wcl.is_active, true) IS TRUE
    ) ${alias} ON true`;
}
