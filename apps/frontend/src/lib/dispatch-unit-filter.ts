/** The unit deep-link applies to roster-backed rows as well as load-backed rows. */
export function filterDispatchUnits<T extends { id?: string; unit_id?: string | null }>(rows: T[], selectedUnitId?: string | null, key: "id" | "unit_id" = "id"): T[] {
  return selectedUnitId ? rows.filter((row) => row[key] === selectedUnitId) : rows;
}
