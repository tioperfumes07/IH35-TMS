/**
 * ROUND 342 — dual-scoped insurance company predicate.
 *
 * Formerly dual-scoped: claim, coi_request, lawsuit, payment_schedule, policy, policy_unit,
 * refund_obligation. type_catalog and mdata.assets were renamed to operating_company_id by CC-1 (202615330400).
 */
// Phase 2 step 2a (migration 202615310700) backfilled operating_company_id and made it NOT NULL on all seven — it is
// the one scope column (owner ruling ROUND 342). Step 2c phase A stops every read/write of the legacy column; phase B
// drops it. Predicate on the canonical column only.
export function insuranceCompanyScope(alias?: string): string {
  return alias ? `${alias}.operating_company_id` : "operating_company_id";
}
