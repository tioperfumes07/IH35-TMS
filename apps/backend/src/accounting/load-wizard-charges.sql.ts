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
  return `LEFT JOIN (
      SELECT cl.load_id,
             COALESCE(SUM(cl.amount_cents) FILTER (
               WHERE lower(cl.charge_code) IN ('linehaul', 'line_haul')
             ), 0)::bigint AS linehaul_cents,
             COALESCE(SUM(cl.amount_cents) FILTER (
               WHERE lower(cl.charge_code) IN ('fuel_surcharge', 'fsc')
             ), 0)::bigint AS fuel_surcharge_cents,
             COALESCE(SUM(cl.amount_cents) FILTER (
               WHERE lower(cl.charge_code) LIKE '%detention%'
                  OR lower(COALESCE(cl.description, '')) LIKE '%detention%'
             ), 0)::bigint AS detention_charge_cents,
             COALESCE(SUM(cl.amount_cents) FILTER (
               WHERE lower(cl.charge_code) LIKE '%layover%'
                  OR lower(COALESCE(cl.description, '')) LIKE '%layover%'
             ), 0)::bigint AS layover_charge_cents,
             COALESCE(SUM(cl.amount_cents) FILTER (
               WHERE lower(cl.charge_code) NOT IN ('linehaul', 'line_haul', 'fuel_surcharge', 'fsc')
                 AND lower(cl.charge_code) NOT LIKE '%detention%'
                 AND lower(cl.charge_code) NOT LIKE '%layover%'
                 AND lower(COALESCE(cl.description, '')) NOT LIKE '%detention%'
                 AND lower(COALESCE(cl.description, '')) NOT LIKE '%layover%'
             ), 0)::bigint AS accessorial_cents
        FROM dispatch.load_charge_lines cl
       WHERE cl.operating_company_id = ${companyExpr}
         AND COALESCE(cl.is_active, true) IS TRUE
       GROUP BY cl.load_id
    ) ${alias} ON ${alias}.load_id = ${loadIdExpr}`;
}
