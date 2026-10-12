/**
 * 443.101 / 443.102 (P38 Wave-A) — THE one rule for "which unit does this load's money belong to".
 *
 * A load's assigned unit counts only when the load's own company owns it or currently leases it — the same rule
 * mdata.refuse_cross_company_reference enforces on accounting.bills.unit_id / bill_lines.unit_id. Every writer that
 * stamps a unit from a load (the per-load driver-bill writers in settlement-ap-chain.service.ts and
 * settlement-bill-payment-posting.service.ts, and the posted-bill stamp in bill-unit-stamp.service.ts) reads it from
 * here, so the forward path and the back-stamp can never disagree.
 *
 * Returns a scalar subquery (uuid, or NULL when the load has no same-entity unit). Its aliases are private (lu_l /
 * lu_u) so it never captures a caller's own `l` / `u`.
 */
export function sameEntityLoadUnitSql(loadIdExpr: string, companyExpr: string): string {
  return `(SELECT lu_u.id FROM mdata.loads lu_l JOIN mdata.units lu_u ON lu_u.id = lu_l.assigned_unit_id
            WHERE lu_l.id = ${loadIdExpr} AND lu_l.operating_company_id = ${companyExpr}
              AND (lu_u.owner_company_id = lu_l.operating_company_id OR lu_u.currently_leased_to_company_id = lu_l.operating_company_id))`;
}
