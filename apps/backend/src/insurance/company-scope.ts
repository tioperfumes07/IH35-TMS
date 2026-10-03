/**
 * ROUND 342 — dual-scoped insurance company predicate.
 *
 * Dual-scoped (tenant_id + operating_company_id): claim, coi_request, lawsuit,
 * payment_schedule, policy, policy_unit, refund_obligation.
 *
 * Rename-only (tenant_id only — do NOT COALESCE): type_catalog, and mdata.assets
 * when joined from insurance readers.
 */
export function insuranceCompanyScope(alias?: string): string {
  if (!alias) return "COALESCE(operating_company_id, tenant_id)";
  return `COALESCE(${alias}.operating_company_id, ${alias}.tenant_id)`;
}
