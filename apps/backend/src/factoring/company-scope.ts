/**
 * ROUND 342 — factoring company predicate.
 *
 * Tables that used to carry a second company column (tenant_id): bank_match_suggestion, batch,
 * customer_factor_assignment, factor, letter_of_release, reserve_movement.
 *
 * Phase 2 step 2a (migration 202615310700) backfilled operating_company_id and made it NOT NULL — it is the one
 * scope column (owner ruling). Step 2c phase A: no code reads or writes the legacy column; phase B drops it.
 */
export function factoringCompanyScope(alias?: string): string {
  return alias ? `${alias}.operating_company_id` : "operating_company_id";
}

/** Map a factoring row's company id — operating_company_id only. A blank is a trap, never a default. */
export function companyIdFromDualScopedRow(row: Record<string, unknown>): string {
  const raw = row.operating_company_id;
  if (raw == null || String(raw).trim() === "") {
    throw new Error("factoring_row_missing_company_id");
  }
  return String(raw);
}
