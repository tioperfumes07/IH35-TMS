/**
 * ROUND 342 — factoring company predicate.
 *
 * Tables that carried BOTH tenant_id + operating_company_id: bank_match_suggestion, batch,
 * customer_factor_assignment, factor, letter_of_release, reserve_movement.
 *
 * Phase 2 step 2a (migration 202615310700) backfilled operating_company_id and made it NOT NULL — it is the one
 * scope column (owner ruling); tenant_id is being dropped, so the old COALESCE(…, tenant_id) fallback would become a
 * SQL error. Rename-only tables (canonical_factor_agreements, the v_factor_reserve_balance view) stay on tenant_id
 * until CC-1's rename — do NOT use this helper there.
 */
export function factoringCompanyScope(alias?: string): string {
  return alias ? `${alias}.operating_company_id` : "operating_company_id";
}

/** Map a dual-scoped row's company id (OCI first). Blank ≡ trap after CC-1 rename. */
export function companyIdFromDualScopedRow(row: Record<string, unknown>): string {
  const raw = row.operating_company_id ?? row.tenant_id;
  if (raw == null || String(raw).trim() === "") {
    throw new Error("factoring_row_missing_company_id");
  }
  return String(raw);
}
