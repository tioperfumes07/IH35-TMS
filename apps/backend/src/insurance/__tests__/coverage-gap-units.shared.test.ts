import { describe, expect, it } from "vitest";
import {
  REQUIRED_COVERAGE_TYPES,
  classifyCoverageGapUnits,
  buildCoverageGapUnitDetails,
  type CoverageGapUnitRow,
  type CoverageGapUnitDetailRow,
} from "../coverage-gap-units.shared.js";

const ALL = REQUIRED_COVERAGE_TYPES;

describe("coverage-gap-units.shared — summary KPI reconciles with detail list (INSURANCE-1)", () => {
  it("counts a unit with no active coverage as uncovered (0 policies -> all units gap)", () => {
    // The TRANSP live state: N units, 0 policies. Every active unit must surface as uncovered, and the
    // KPI must equal the listed rows (regression: detail used to collapse to 0 while summary said 50).
    const rows: CoverageGapUnitRow[] = [
      { unit_id: "u1", unit_number: "101", covered_types: [] },
      { unit_id: "u2", unit_number: "102", covered_types: null },
      { unit_id: "u3", unit_number: "103", covered_types: [] },
    ];
    const result = classifyCoverageGapUnits(rows);

    expect(result.uncovered_units).toHaveLength(3);
    expect(result.mismatched_units).toHaveLength(0);
    expect(result.coverage_gap_count).toBe(3);
    // Every uncovered unit lists ALL required types as missing.
    expect(result.uncovered_units[0]?.missing_types).toEqual(ALL);
  });

  it("classifies partial coverage as mismatched, full coverage as not-a-gap", () => {
    const rows: CoverageGapUnitRow[] = [
      { unit_id: "u1", unit_number: "201", covered_types: [...ALL] }, // fully covered -> not a gap
      { unit_id: "u2", unit_number: "202", covered_types: ["auto_liability"] }, // partial -> mismatched
      { unit_id: "u3", unit_number: "203", covered_types: [] }, // none -> uncovered
    ];
    const result = classifyCoverageGapUnits(rows);

    expect(result.uncovered_units.map((u) => u.unit_id)).toEqual(["u3"]);
    expect(result.mismatched_units.map((u) => u.unit_id)).toEqual(["u2"]);
    expect(result.mismatched_units[0]?.missing_types).toEqual(
      ALL.filter((t) => t !== "auto_liability")
    );
    expect(result.coverage_gap_count).toBe(2);
  });

  it("INVARIANT: coverage_gap_count ALWAYS equals uncovered + mismatched row counts", () => {
    // This is the exact relationship the summary KPI and the detail tab both depend on. If it ever
    // diverges, the headline number is no longer traceable to the list and CI must fail.
    const fixtures: CoverageGapUnitRow[][] = [
      [],
      [{ unit_id: "a", unit_number: "1", covered_types: [] }],
      [
        { unit_id: "a", unit_number: "1", covered_types: [...ALL] },
        { unit_id: "b", unit_number: "2", covered_types: ["cargo"] },
        { unit_id: "c", unit_number: "3", covered_types: null },
        { unit_id: "d", unit_number: "4", covered_types: ["auto_liability", "physical_damage"] },
      ],
    ];

    for (const rows of fixtures) {
      const result = classifyCoverageGapUnits(rows);
      expect(result.coverage_gap_count).toBe(
        result.uncovered_units.length + result.mismatched_units.length
      );
    }
  });

  it("ignores unknown/non-required covered types when computing the gap", () => {
    const rows: CoverageGapUnitRow[] = [
      { unit_id: "u1", unit_number: "301", covered_types: ["some_other_type"] },
    ];
    const result = classifyCoverageGapUnits(rows);
    // Only a non-required type is present -> still missing every required type -> uncovered.
    expect(result.uncovered_units).toHaveLength(1);
    expect(result.coverage_gap_count).toBe(1);
  });
});

// GO-02 LIST API (INBOX-CC-1 TOP-1, 2026-09-01): "Frozen paste: per-type
// {coverage_type, status, policy_id, policy_number, expiry_date}[]. Trailer AL = not_required.
// Catalog-driven, never hardcode three types."
describe("coverage-gap-units.shared — buildCoverageGapUnitDetails (GO-02 LIST API)", () => {
  it("a trailer's auto_liability is not_required, never missing", () => {
    const rows: CoverageGapUnitDetailRow[] = [
      { unit_id: null, asset_id: "a1", unit_number: "USMCA-APD-16", asset_type: "reefer", coverage_type: "auto_liability", sort_order: 10, policy_id: null, policy_number: null, expiry_date: null },
      { unit_id: null, asset_id: "a1", unit_number: "USMCA-APD-16", asset_type: "reefer", coverage_type: "physical_damage", sort_order: 20, policy_id: "p1", policy_number: "437539", expiry_date: "2027-08-25" },
      { unit_id: null, asset_id: "a1", unit_number: "USMCA-APD-16", asset_type: "reefer", coverage_type: "cargo", sort_order: 30, policy_id: null, policy_number: null, expiry_date: null },
    ];
    const [unit] = buildCoverageGapUnitDetails(rows);
    expect(unit?.asset_type).toBe("reefer");
    const al = unit?.coverage.find((c) => c.coverage_type === "auto_liability");
    expect(al?.status).toBe("not_required");
    const pd = unit?.coverage.find((c) => c.coverage_type === "physical_damage");
    expect(pd).toEqual({ coverage_type: "physical_damage", status: "covered", policy_id: "p1", policy_number: "437539", expiry_date: "2027-08-25" });
    const cargo = unit?.coverage.find((c) => c.coverage_type === "cargo");
    expect(cargo?.status).toBe("missing");
  });

  it("a tractor's auto_liability is a real requirement -- missing when uncovered, covered when a policy is attached", () => {
    const rows: CoverageGapUnitDetailRow[] = [
      { unit_id: "u1", asset_id: "a2", unit_number: "T163", asset_type: "tractor", coverage_type: "auto_liability", sort_order: 10, policy_id: null, policy_number: null, expiry_date: null },
      { unit_id: "u1", asset_id: "a2", unit_number: "T163", asset_type: "tractor", coverage_type: "physical_damage", sort_order: 20, policy_id: "p2", policy_number: "437539", expiry_date: "2027-08-25" },
    ];
    const [unit] = buildCoverageGapUnitDetails(rows);
    const al = unit?.coverage.find((c) => c.coverage_type === "auto_liability");
    expect(al?.status).toBe("missing");
  });

  it("is_gap only looks at REQUIRED_COVERAGE_TYPES, not the full catalog array -- a missing cyber_liability is not a gap", () => {
    const rows: CoverageGapUnitDetailRow[] = [
      { unit_id: "u1", asset_id: "a3", unit_number: "T170", asset_type: "tractor", coverage_type: "auto_liability", sort_order: 10, policy_id: "p3", policy_number: "CIMD-2026-0720", expiry_date: "2027-08-25" },
      { unit_id: "u1", asset_id: "a3", unit_number: "T170", asset_type: "tractor", coverage_type: "physical_damage", sort_order: 20, policy_id: "p4", policy_number: "437539", expiry_date: "2027-08-25" },
      { unit_id: "u1", asset_id: "a3", unit_number: "T170", asset_type: "tractor", coverage_type: "cargo", sort_order: 30, policy_id: "p5", policy_number: "437540", expiry_date: "2027-08-25" },
      { unit_id: "u1", asset_id: "a3", unit_number: "T170", asset_type: "tractor", coverage_type: "cyber_liability", sort_order: 150, policy_id: null, policy_number: null, expiry_date: null },
    ];
    const [unit] = buildCoverageGapUnitDetails(rows, REQUIRED_COVERAGE_TYPES);
    expect(unit?.coverage).toHaveLength(4);
    expect(unit?.coverage.find((c) => c.coverage_type === "cyber_liability")?.status).toBe("missing");
    expect(unit?.is_gap).toBe(false); // all 3 REQUIRED types are covered; cyber_liability doesn't count
  });

  it("groups a trailer with no mdata.units row by asset_id (unit_id null), a tractor by unit_id", () => {
    const rows: CoverageGapUnitDetailRow[] = [
      { unit_id: null, asset_id: "trailer-1", unit_number: "USMCA-APD-17", asset_type: "flatbed", coverage_type: "cargo", sort_order: 30, policy_id: null, policy_number: null, expiry_date: null },
      { unit_id: "unit-1", asset_id: "asset-1", unit_number: "T144", asset_type: "tractor", coverage_type: "cargo", sort_order: 30, policy_id: null, policy_number: null, expiry_date: null },
    ];
    const details = buildCoverageGapUnitDetails(rows);
    expect(details).toHaveLength(2);
    expect(details.find((u) => u.unit_number === "USMCA-APD-17")?.unit_id).toBeNull();
    expect(details.find((u) => u.unit_number === "T144")?.unit_id).toBe("unit-1");
  });
});
