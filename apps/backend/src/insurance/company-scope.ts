/**
 * ROUND 342 — dual-scoped insurance company predicate.
 *
 * Dual-scoped (tenant_id + operating_company_id): claim, coi_request, lawsuit,
 * payment_schedule, policy, policy_unit, refund_obligation.
 *
 * Rename-only (tenant_id only — do NOT COALESCE): type_catalog, and mdata.assets
 * when joined from insurance readers.
 */
// Phase 2 step 2a (migration 202615310700) backfilled operating_company_id and made it NOT NULL on all seven — it is
// the one scope column (owner ruling ROUND 342) and tenant_id is being dropped, so a COALESCE(…, tenant_id) fallback
// would become a SQL error. Predicate on the canonical column only.
export function insuranceCompanyScope(alias?: string): string {
  return alias ? `${alias}.operating_company_id` : "operating_company_id";
}
