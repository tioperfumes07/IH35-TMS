/**
 * VOID-COLUMN 2026-09-03 — customers are master data.
 * Selectable / listed as Active <=> deactivated_at IS NULL.
 * mdata.customers.status is credit/ops (active|inactive|credit_hold|blacklist), not liveness.
 */
export function customerIsSelectable(row: { deactivated_at?: string | null }): boolean {
  return row.deactivated_at == null;
}
