/**
 * ROUND 342 — dual-scoped factoring company predicate.
 *
 * Tables with BOTH tenant_id + operating_company_id today:
 *   bank_match_suggestion, batch, customer_factor_assignment, factor,
 *   letter_of_release, reserve_movement
 *
 * Prefer operating_company_id; fall back to tenant_id until CC-1 drops/renames
 * the legacy column. Rename-only tables (canonical_factor_agreements, the
 * v_factor_reserve_balance view) stay on tenant_id — do NOT use this helper there.
 */
export function factoringCompanyScope(alias?: string): string {
  if (!alias) return "COALESCE(operating_company_id, tenant_id)";
  return `COALESCE(${alias}.operating_company_id, ${alias}.tenant_id)`;
}

/** Map a dual-scoped row's company id (OCI first). Blank ≡ trap after CC-1 rename. */
export function companyIdFromDualScopedRow(row: Record<string, unknown>): string {
  const raw = row.operating_company_id ?? row.tenant_id;
  if (raw == null || String(raw).trim() === "") {
    throw new Error("factoring_row_missing_company_id");
  }
  return String(raw);
}
