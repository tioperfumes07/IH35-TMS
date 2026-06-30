import { describe, expect, it } from "vitest";
import {
  REQUIRED_COVERAGE_TYPES,
  classifyCoverageGapUnits,
  type CoverageGapUnitRow,
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
