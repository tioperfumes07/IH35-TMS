/**
 * INSURANCE FIXTURE VISIBILITY — the single definition of "which insurance rows a human is allowed to
 * see" for the /safety/insurance module. Mirrors the pattern in mdata/fleet-visibility.ts, adapted for
 * a schema that has NO `is_sample_data` column anywhere.
 *
 * INSURANCE-DASHBOARD-FIXTURE-LEAK (2026-08-23): live-verified on prod (Neon tiny-field-89581227,
 * USMCA 5c854333-6ea5-4faa-af31-67cb272fef80, bypass_rls('lucia')) — every row driving 4 of the 6
 * Insurance Dashboard KPIs (/safety/insurance) was an agent-created live-gate-proof / guard-selftest
 * fixture, not a real business record:
 *
 *   insurance.policy   3/3 active rows — SAMPLE-POL-5743-SIMPLE, SAMPLE-REPROVE-5094-VENDOR-0809,
 *                                        SAMPLE-VENDOR-UX-0809 (insurer_name "SAMPLE Progressive
 *                                        Commercial" / "CC3 Verify Vendor")
 *   insurance.claim    4/4 open rows   — SAMPLE-CLAIM-V4-0809, CLM-CASCADE-USMCA-01,
 *                                        LIVE-GATE-PROVE-CLAIM-CC2, CODEX-LAWSUIT-NESTED-CLM-20260816-0354
 *   insurance.lawsuit  1/1 filed row   — CODEX-LAWSUIT-20260816-0410 (plaintiff "CODEX TEST PLAINTIFF")
 *
 * TOTAL ACTIVE POLICIES=3, POLICIES EXPIRING IN 30 DAYS=3, OPEN CLAIMS COUNT=4, OPEN LAWSUITS COUNT=1
 * on the live dashboard were therefore 100% fixture-derived — the owner had ZERO real insurance
 * coverage wired, yet the UI reported 3 active policies.
 *
 * WORSE than a simple inflated count: two of those fixture policies (SAMPLE-REPROVE-5094-VENDOR-0809,
 * SAMPLE-VENDOR-UX-0809) are linked via insurance.policy_unit to REAL fleet units T120/T151. The
 * Coverage Gap KPI's per-unit LATERAL join (coverage-gap-units.shared.ts) and the Fleet Unit Profile
 * "Insurance summary" card (mdata/unit-aggregate.service.ts) both treated those two real trucks as
 * INSURED when they carry no real policy — a false negative masking real risk, not just noise.
 *
 * Neither `insurance.policy`, `insurance.claim`, nor `insurance.lawsuit` has an `is_sample_data`
 * column (unlike mdata.units/drivers/loads/equipment), and `mdata/fleet-visibility.ts`'s
 * `FLEET_DEMO_PHANTOM_PATTERNS` ('SAM-%') does NOT match 'SAMPLE-%' (no hyphen after SAM) — reusing
 * that pattern verbatim would still miss every fixture row above. This file is the insurance-schema
 * equivalent, enforced by scripts/verify-steps/4623-verify-insurance-dashboard-excludes-fixture-data.mjs.
 */

/** Identifier prefixes/substrings known to mark an agent-created insurance fixture row. */
export const INSURANCE_FIXTURE_ID_PATTERNS = [
  "SAMPLE-%",
  "SAM-%",
  "TEST%",
  "%DEMO%",
  "CODEX-%",
  "%CASCADE%",
  "LIVE-GATE-%",
] as const;

/**
 * SQL predicate excluding rows whose identifier column (policy_number / claim_number / case_number)
 * matches a known fixture pattern. NULL-safe — a NULL identifier is not excluded (never seen in prod,
 * but a query must not silently drop real rows over a missing label). Static literal patterns (no
 * user input) so this is safe to inline into a query string.
 *
 * @param col the (optionally table-qualified) identifier column — e.g. `policy_number`,
 *            `c.claim_number`, `lawsuit.case_number`. Caller-controlled identifier, never user input.
 */
export function excludeInsuranceFixtureSql(col: string): string {
  return `(${col} IS NULL OR (
    ${col} NOT ILIKE 'SAMPLE-%' AND ${col} NOT ILIKE 'SAM-%' AND ${col} NOT ILIKE 'TEST%' AND
    ${col} NOT ILIKE '%DEMO%' AND ${col} NOT ILIKE 'CODEX-%' AND ${col} NOT ILIKE '%CASCADE%' AND
    ${col} NOT ILIKE 'LIVE-GATE-%'
  ))`;
}
