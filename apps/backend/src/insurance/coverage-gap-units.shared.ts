import { DISPATCH_REQUIRED_INSURANCE_COVERAGE_TYPES } from "./coverage-gap.service.js";
import type { InsuranceCoverageType } from "./policy.shared.js";

/**
 * CANONICAL "coverage gap" definition — the SINGLE source of truth shared by BOTH the insurance
 * Landing KPI (`/api/v1/insurance/summary` -> coverage_gap_count) AND the Coverage Gaps detail tab
 * (`/api/v1/insurance/coverage-gaps`). Before INSURANCE-1 the two ends used different definitions:
 *
 *   - summary.coverage_gap_count: ONE SQL aggregate over mdata.units = units with no active policy
 *     (returned 50 for TRANSP).
 *   - detail tab: a per-unit client fan-out to GET /assets/:id/coverage that 404'd for every unit
 *     lacking an mdata.assets mirror row, collapsing the whole list to 0 ("No uncovered units").
 *
 * A headline KPI a user cannot drill into to the same number is not acceptable (QBO/NetSuite
 * traceability bar). Both ends now derive from `COVERAGE_GAP_UNITS_SQL` + `classifyCoverageGapUnits`:
 *
 * Definition: a fleet unit (active, company-scoped) is a coverage gap when it is missing AT LEAST ONE
 * required coverage type (auto_liability / physical_damage / cargo) from an active, in-effect policy.
 * Two DISJOINT buckets so the rows never double-count:
 *   - uncovered  = zero active required coverage (missing all required types).
 *   - mismatched = some active required coverage but still missing >= 1 required type.
 * coverage_gap_count = uncovered.length + mismatched.length (= units missing >= 1 required type).
 *
 * Read-only (SELECT) — no posting/GL, no writes.
 */

export const REQUIRED_COVERAGE_TYPES: InsuranceCoverageType[] = DISPATCH_REQUIRED_INSURANCE_COVERAGE_TYPES;

/**
 * One row per active, company-scoped fleet unit, with the array of REQUIRED coverage types that the
 * unit currently carries via an active, in-effect policy (resolved through the asset->policy_unit
 * chain, unit linked to asset by unit_code = unit_number — see migration 0262). A unit with no asset
 * mirror row or no active policy yields an empty covered set and therefore surfaces as a gap.
 *
 * $1 = operating_company_id (uuid), $2 = required coverage types (text[]).
 *
 * Unit<->company scoping is written as the explicit `leased = $1 OR (leased IS NULL AND owner = $1)`
 * form (equivalent to COALESCE(leased, owner) = $1) so the verify-mdata-entity-scope static guard
 * recognizes the literal entity predicate on mdata.units.
 */
export const COVERAGE_GAP_UNITS_SQL = `
  SELECT
    u.id::text AS unit_id,
    u.unit_number AS unit_number,
    COALESCE(cov.covered_types, ARRAY[]::text[]) AS covered_types
  FROM mdata.units u
  LEFT JOIN LATERAL (
    SELECT array_agg(DISTINCT p.coverage_type::text) AS covered_types
    FROM mdata.assets a
    JOIN insurance.policy_unit pu
      ON pu.asset_id = a.id AND pu.removed_at IS NULL
    JOIN insurance.policy p
      ON p.id = pu.policy_id
     AND p.tenant_id = pu.tenant_id
     AND p.status = 'active'
     AND p.effective_date <= now()::date
     AND p.expiry_date >= now()::date
    WHERE a.tenant_id = $1::uuid
      AND a.unit_code = u.unit_number
      AND p.coverage_type::text = ANY($2::text[])
  ) cov ON true
  WHERE (
          u.currently_leased_to_company_id = $1::uuid
          OR (u.currently_leased_to_company_id IS NULL AND u.owner_company_id = $1::uuid)
        )
    AND u.deactivated_at IS NULL
  ORDER BY u.unit_number ASC
`;

export type CoverageGapUnitRow = {
  unit_id: string;
  unit_number: string | null;
  covered_types: string[] | null;
};

export type CoverageGapUnit = {
  unit_id: string;
  unit_number: string | null;
  missing_types: InsuranceCoverageType[];
};

export type CoverageGapClassification = {
  uncovered_units: CoverageGapUnit[];
  mismatched_units: CoverageGapUnit[];
  coverage_gap_count: number;
};

/**
 * Classify the rows from COVERAGE_GAP_UNITS_SQL into the two disjoint gap buckets and the total count.
 * `coverage_gap_count` is ALWAYS uncovered_units.length + mismatched_units.length, so the headline KPI
 * equals exactly the number of rows the detail tab lists.
 */
export function classifyCoverageGapUnits(
  rows: CoverageGapUnitRow[],
  requiredTypes: InsuranceCoverageType[] = REQUIRED_COVERAGE_TYPES
): CoverageGapClassification {
  const uncovered_units: CoverageGapUnit[] = [];
  const mismatched_units: CoverageGapUnit[] = [];

  for (const row of rows) {
    const covered = new Set((row.covered_types ?? []).filter(Boolean));
    // Only REQUIRED types count toward coverage — a stray non-required policy must not mask a gap.
    const coveredRequired = requiredTypes.filter((type) => covered.has(type));
    const missing = requiredTypes.filter((type) => !covered.has(type));
    if (missing.length === 0) continue; // fully covered — not a gap

    const entry: CoverageGapUnit = {
      unit_id: row.unit_id,
      unit_number: row.unit_number ?? null,
      missing_types: missing,
    };
    if (coveredRequired.length === 0) {
      uncovered_units.push(entry); // zero active required coverage
    } else {
      mismatched_units.push(entry); // partial coverage, still missing >= 1 required type
    }
  }

  return {
    uncovered_units,
    mismatched_units,
    coverage_gap_count: uncovered_units.length + mismatched_units.length,
  };
}
