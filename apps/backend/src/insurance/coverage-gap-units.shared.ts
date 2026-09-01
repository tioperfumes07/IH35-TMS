import { DISPATCH_REQUIRED_INSURANCE_COVERAGE_TYPES } from "./coverage-gap.service.js";
import type { InsuranceCoverageType } from "./policy.shared.js";
import { excludeDemoPhantomSql, excludeSampleDataSql } from "../mdata/fleet-visibility.js";
import { excludeInsuranceFixtureSql } from "./insurance-visibility.js";

// GO-02 (INBOX-CC-1 2026-09-01) — asset_type values that are trailer sub-types (mdata.assets'
// own CHECK constraint: tractor/dry_van/reefer/flatbed/personnel_vehicle/other). auto_liability
// is physically a power-unit coverage (bodily injury/property damage from OPERATING a vehicle on
// the road) — a trailer is never itself driven, it is towed under the towing tractor's own
// policy. Kept identical to coverage-gap.service.ts's TRAILER_ASSET_TYPES so the two never drift.
const TRAILER_ASSET_TYPES = new Set(["dry_van", "reefer", "flatbed"]);

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
 *
 * INSURANCE-DASHBOARD-FIXTURE-LEAK (2026-08-23): live-verified on prod — two agent-created fixture
 * policies (SAMPLE-REPROVE-5094-VENDOR-0809, SAMPLE-VENDOR-UX-0809) were linked via
 * insurance.policy_unit to REAL fleet units T120/T151, so this query counted those two real trucks as
 * covered when they carry no real policy — a false negative masking real risk. The LATERAL join now
 * excludes fixture-named policies (excludeInsuranceFixtureSql, see insurance-visibility.ts), and the
 * outer unit scan now excludes demo/phantom-named and is_sample_data fixture units (same helpers Fleet
 * already uses, mdata/fleet-visibility.ts), so a fixture truck can no longer surface as a real gap
 * (or a real gap get hidden behind a fixture policy) on this KPI or its detail drill-down.
 */

export const REQUIRED_COVERAGE_TYPES: InsuranceCoverageType[] = DISPATCH_REQUIRED_INSURANCE_COVERAGE_TYPES;

/**
 * One row per active, company-scoped fleet unit, with the array of REQUIRED coverage types that the
 * unit currently carries via an active, in-effect policy (resolved through the asset->policy_unit
 * chain, unit linked to asset by unit_code = unit_number — see migration 0262). A unit with no asset
 * mirror row or no active policy yields an empty covered set and therefore surfaces as a gap.
 *
 * $1 = operating_company_id (uuid), $2 = required coverage types (text[]), $3 = optional unit id.
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
     AND ${excludeInsuranceFixtureSql("p.policy_number")}
    WHERE a.tenant_id = $1::uuid
      AND a.unit_code = u.unit_number
      AND p.coverage_type::text = ANY($2::text[])
  ) cov ON true
  WHERE (
          u.currently_leased_to_company_id = $1::uuid
          OR (u.currently_leased_to_company_id IS NULL AND u.owner_company_id = $1::uuid)
        )
    AND u.deactivated_at IS NULL
    AND ${excludeDemoPhantomSql("u.unit_number")}
    AND ${excludeSampleDataSql("u.is_sample_data")}
    AND ($3::uuid IS NULL OR u.id = $3::uuid)
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

// ────────────────────────────────────────────────────────────────────────────────────────────
// GO-02 LIST API (INBOX-CC-1 TOP-1, 2026-09-01) — per-unit, PER-TYPE array for the Coverage Gaps
// detail tab. The classification above (missing_types[]) stays the summary KPI's own definition,
// UNCHANGED, so coverage_gap_count cannot regress. This is additive: a richer detail shape the
// route below returns ALONGSIDE the existing uncovered/mismatched buckets, not a replacement.
//
// Two real gaps the old shape could not express:
//   1. It only ever reported on the 3 DISPATCH_REQUIRED types (hardcoded) — a unit's real
//      general_liability/umbrella/etc. coverage, and the policy actually backing it, was invisible.
//      "Catalog-driven, never hardcode three types" — every ACTIVE row in insurance.type_catalog
//      for this tenant is included, not a hardcoded TS array.
//   2. It only ever scanned mdata.units (tractors) — trailer assets (mdata.assets asset_type IN
//      dry_van/reefer/flatbed, created by GO-01) were structurally invisible to this endpoint.
// ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * One row per (insurable unit/asset, catalog coverage type) pair for this tenant. "Insurable"
 * covers BOTH mdata.units tractors (as COVERAGE_GAP_UNITS_SQL above) AND mdata.assets trailer
 * sub-type rows that have no mdata.units mirror (structurally true today — mdata.units carries
 * only tractors). $1 = operating_company_id, $2 = optional unit_id OR asset_id filter (matches
 * either the tractor's mdata.units.id or a trailer's mdata.assets.id — a trailer has no
 * mdata.units.id to filter by).
 */
export const COVERAGE_GAP_UNITS_DETAIL_SQL = `
  WITH insurable_units AS (
    SELECT u.id AS unit_id, a.id AS asset_id, u.unit_number AS unit_number, 'tractor'::text AS asset_type
    FROM mdata.units u
    JOIN mdata.assets a
      ON a.tenant_id = $1::uuid
     AND a.unit_code = u.unit_number
    WHERE (
            u.currently_leased_to_company_id = $1::uuid
            OR (u.currently_leased_to_company_id IS NULL AND u.owner_company_id = $1::uuid)
          )
      AND u.deactivated_at IS NULL
      AND ${excludeDemoPhantomSql("u.unit_number")}
      AND ${excludeSampleDataSql("u.is_sample_data")}
      AND ($2::uuid IS NULL OR u.id = $2::uuid)

    UNION ALL

    SELECT NULL::uuid AS unit_id, a.id AS asset_id, a.unit_code AS unit_number, a.asset_type
    FROM mdata.assets a
    WHERE a.tenant_id = $1::uuid
      AND a.asset_type IN ('dry_van', 'reefer', 'flatbed')
      AND a.status = 'active'
      AND ${excludeDemoPhantomSql("a.unit_code")}
      AND ($2::uuid IS NULL OR a.id = $2::uuid)
  )
  SELECT
    iu.unit_id::text            AS unit_id,
    iu.asset_id::text           AS asset_id,
    iu.unit_number              AS unit_number,
    iu.asset_type               AS asset_type,
    tc.code                     AS coverage_type,
    tc.sort_order                AS sort_order,
    p.id::text                  AS policy_id,
    p.policy_number             AS policy_number,
    p.expiry_date::text         AS expiry_date
  FROM insurable_units iu
  CROSS JOIN insurance.type_catalog tc
  LEFT JOIN LATERAL (
    SELECT pol.id, pol.policy_number, pol.expiry_date
    FROM insurance.policy_unit pu
    JOIN insurance.policy pol
      ON pol.id = pu.policy_id
     AND pol.tenant_id = pu.tenant_id
     AND pol.status = 'active'
     AND pol.effective_date <= now()::date
     AND pol.expiry_date >= now()::date
     AND pol.coverage_type_id = tc.id
     AND ${excludeInsuranceFixtureSql("pol.policy_number")}
    WHERE pu.asset_id = iu.asset_id
      AND pu.removed_at IS NULL
    LIMIT 1
  ) p ON true
  WHERE tc.tenant_id = $1::uuid
    AND tc.active = true
  ORDER BY iu.unit_number ASC, tc.sort_order ASC
`;

export type CoverageGapUnitDetailRow = {
  unit_id: string | null;
  asset_id: string;
  unit_number: string | null;
  asset_type: string;
  coverage_type: string;
  sort_order: number;
  policy_id: string | null;
  policy_number: string | null;
  expiry_date: string | null;
};

export type CoverageGapTypeStatus = "covered" | "missing" | "not_required";

export type CoverageGapTypeEntry = {
  coverage_type: string;
  status: CoverageGapTypeStatus;
  policy_id: string | null;
  policy_number: string | null;
  expiry_date: string | null;
};

export type CoverageGapUnitDetail = {
  unit_id: string | null;
  asset_id: string;
  unit_number: string | null;
  asset_type: string;
  coverage: CoverageGapTypeEntry[];
  is_gap: boolean;
};

/**
 * Groups COVERAGE_GAP_UNITS_DETAIL_SQL's flat rows into one entry per unit/asset, each carrying
 * the FULL per-type coverage array. `is_gap` stays anchored to requiredTypes (default: the same
 * DISPATCH_REQUIRED_INSURANCE_COVERAGE_TYPES the summary KPI uses) so the "gap" concept itself is
 * unchanged -- only the array now exposes every catalog type + its backing policy, not just the
 * required subset.
 */
export function buildCoverageGapUnitDetails(
  rows: CoverageGapUnitDetailRow[],
  requiredTypes: InsuranceCoverageType[] = REQUIRED_COVERAGE_TYPES
): CoverageGapUnitDetail[] {
  const byKey = new Map<string, CoverageGapUnitDetail>();

  for (const row of rows) {
    const key = row.unit_id ?? `asset:${row.asset_id}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        unit_id: row.unit_id,
        asset_id: row.asset_id,
        unit_number: row.unit_number,
        asset_type: row.asset_type,
        coverage: [],
        is_gap: false,
      };
      byKey.set(key, entry);
    }

    const notRequired = row.coverage_type === "auto_liability" && TRAILER_ASSET_TYPES.has(row.asset_type);
    const status: CoverageGapTypeStatus = notRequired ? "not_required" : row.policy_id ? "covered" : "missing";

    entry.coverage.push({
      coverage_type: row.coverage_type,
      status,
      policy_id: row.policy_id,
      policy_number: row.policy_number,
      expiry_date: row.expiry_date,
    });
  }

  for (const entry of byKey.values()) {
    entry.is_gap = requiredTypes.some((type) => {
      const found = entry.coverage.find((c) => c.coverage_type === type);
      return found ? found.status === "missing" : false;
    });
  }

  return [...byKey.values()];
}
