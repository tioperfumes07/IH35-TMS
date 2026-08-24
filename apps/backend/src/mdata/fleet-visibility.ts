/**
 * FLEET VISIBILITY — the single definition of "which fleet rows a human is allowed to see".
 *
 * WHY THIS FILE EXISTS (FLEET-KPI-PARITY, 2026-08-02): the demo/phantom exclusion lived as a private
 * function inside units-unified-list.service.ts, so the Fleet ROSTER applied it and the maintenance
 * dashboard fleet KPI did not. Two queries over mdata.units, scoped identically and correctly by
 * (owner_company_id OR currently_leased_to_company_id), still disagreed:
 *
 *   USMCA, live 2026-08-02 — roster "0 of 0" while AVG-AGE rendered 4.0y off the same table.
 *   Cause: the unit was named TEST-U01. The roster hid it (correct, E1 hygiene); the KPI counted it.
 *
 * A number a human reads as fact (unit count, average age, in-shop count) must never be computed over
 * rows that the corresponding list refuses to show — otherwise the KPI is unauditable: you cannot click
 * through to the rows that produced it. Same rule as SILENT-SUCCESS: no surface may state a figure it
 * cannot substantiate.
 *
 * Both readers now import from here. Enforced by scripts/verify-fleet-visibility-parity.mjs, which
 * fails if either reader inlines its own copy of the pattern instead of importing this helper.
 *
 * FLEET-VISIBILITY-F4583-SAMPLE-DATA-GAP (2026-08-23): the name-pattern predicate below predates
 * migration 0403's `is_sample_data` column and was never widened to also honor it, so fixture units
 * named outside SAM-%/TEST%/%DEMO% (e.g. "CODEX-AUDIT-UNIT-20260816-0349", correctly flagged
 * `is_sample_data=true`) were live on prod's `/fleet` roster AND counted in the KPI tiles (Total
 * Fleet/Active/etc.) — same root defect class as `LV-DRIVER-HUB-SCHEDULER-TEST-FIXTURES-IN-PROD-
 * PICKER` (#14909), one level deeper (this file's own single-source-of-truth was itself incomplete).
 * `excludeSampleDataSql` was mdata.units-only at first — mdata.equipment (trailers) had NO
 * `is_sample_data` column (migration 0403 added it to 5 tables, not equipment). Migration
 * 202613140000 closed that gap; `excludeSampleDataSql` now applies to both tables (units-unified-
 * list.service.ts's trailer query included).
 */

/** Unit-number / equipment-number prefixes that are seeded fixtures or integration phantoms. */
export const FLEET_DEMO_PHANTOM_PATTERNS = ["SAM-%", "TEST%", "%DEMO%"] as const;

/**
 * SQL predicate excluding seeded TEST/DEMO rows and the phantom `SAM-*` Samsara dual-write rows.
 * Static literal patterns (no user input) so it is safe to inline into a query string.
 *
 * @param col the identifier column — `unit_number` for mdata.units, `equipment_number` for
 *            mdata.equipment. Caller-controlled identifier, never user input.
 */
export function excludeDemoPhantomSql(col: string): string {
  return `(${col} NOT ILIKE 'SAM-%' AND ${col} NOT ILIKE 'TEST%' AND ${col} NOT ILIKE '%DEMO%')`;
}

/**
 * SQL predicate excluding `is_sample_data=true` rows. Applies to both `mdata.units` and, since
 * migration 202613140000, `mdata.equipment`. Complements, never replaces, `excludeDemoPhantomSql`: a
 * fixture can be caught by either the name pattern or the flag.
 *
 * @param col the (optionally table-qualified) column — `is_sample_data` or `u.is_sample_data`.
 *            Caller-controlled identifier, never user input.
 */
export function excludeSampleDataSql(col = "is_sample_data"): string {
  return `${col} IS NOT TRUE`;
}
