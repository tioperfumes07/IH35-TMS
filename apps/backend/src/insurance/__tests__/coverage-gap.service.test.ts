import { describe, expect, it } from "vitest";
import {
  DISPATCH_REQUIRED_INSURANCE_COVERAGE_TYPES,
  buildAssetCoverageGapResult,
  requiredCoverageTypesForAssetType,
} from "../coverage-gap.service.js";

describe("coverage-gap.service", () => {
  it("marks unit covered when all required active policies are present", () => {
    const result = buildAssetCoverageGapResult(
      [
        {
          policy_id: "p1",
          coverage_type: "auto_liability",
          status: "active",
          effective_date: "2026-01-01",
          expiry_date: "2026-12-31",
        },
        {
          policy_id: "p2",
          coverage_type: "physical_damage",
          status: "active",
          effective_date: "2026-01-01",
          expiry_date: "2026-12-31",
        },
        {
          policy_id: "p3",
          coverage_type: "cargo",
          status: "active",
          effective_date: "2026-01-01",
          expiry_date: "2026-12-31",
        },
      ],
      { asOfDate: "2026-05-01" }
    );

    expect(result.required_types).toEqual(DISPATCH_REQUIRED_INSURANCE_COVERAGE_TYPES);
    expect(result.is_covered).toBe(true);
    expect(result.gap_types).toEqual([]);
    expect(result.covered_types).toEqual(DISPATCH_REQUIRED_INSURANCE_COVERAGE_TYPES);
  });

  it("returns coverage gaps when required policies are expired or inactive", () => {
    const result = buildAssetCoverageGapResult(
      [
        {
          policy_id: "p1",
          coverage_type: "auto_liability",
          status: "expired",
          effective_date: "2026-01-01",
          expiry_date: "2026-03-01",
        },
        {
          policy_id: "p2",
          coverage_type: "physical_damage",
          status: "active",
          effective_date: "2026-01-01",
          expiry_date: "2026-12-31",
        },
      ],
      { asOfDate: "2026-05-01" }
    );

    expect(result.is_covered).toBe(false);
    expect(result.covered_types).toEqual(["physical_damage"]);
    expect(result.gap_types).toEqual(["auto_liability", "cargo"]);
  });

  it("supports custom required types", () => {
    const result = buildAssetCoverageGapResult(
      [
        {
          policy_id: "p1",
          coverage_type: "cargo",
          status: "active",
          effective_date: "2026-01-01",
          expiry_date: "2026-12-31",
        },
      ],
      {
        asOfDate: "2026-05-01",
        requiredTypes: ["cargo"],
      }
    );

    expect(result.is_covered).toBe(true);
    expect(result.gap_types).toEqual([]);
    expect(result.covered_types).toEqual(["cargo"]);
  });

  // GO-02: auto_liability is a power-unit coverage -- a trailer is never itself driven, it is
  // towed under the tractor's own policy. Trailer sub-types must not show a false gap for it.
  it("requiredCoverageTypesForAssetType excludes auto_liability for trailer sub-types", () => {
    expect(requiredCoverageTypesForAssetType("reefer")).toEqual(["physical_damage", "cargo"]);
    expect(requiredCoverageTypesForAssetType("flatbed")).toEqual(["physical_damage", "cargo"]);
    expect(requiredCoverageTypesForAssetType("dry_van")).toEqual(["physical_damage", "cargo"]);
  });

  it("requiredCoverageTypesForAssetType keeps the full list for tractors and other road-operated types", () => {
    expect(requiredCoverageTypesForAssetType("tractor")).toEqual(DISPATCH_REQUIRED_INSURANCE_COVERAGE_TYPES);
    expect(requiredCoverageTypesForAssetType("personnel_vehicle")).toEqual(DISPATCH_REQUIRED_INSURANCE_COVERAGE_TYPES);
    expect(requiredCoverageTypesForAssetType("other")).toEqual(DISPATCH_REQUIRED_INSURANCE_COVERAGE_TYPES);
    expect(requiredCoverageTypesForAssetType(null)).toEqual(DISPATCH_REQUIRED_INSURANCE_COVERAGE_TYPES);
    expect(requiredCoverageTypesForAssetType(undefined)).toEqual(DISPATCH_REQUIRED_INSURANCE_COVERAGE_TYPES);
  });

  it("a trailer with only physical_damage + cargo active policies shows fully covered, not gapped on auto_liability", () => {
    const result = buildAssetCoverageGapResult(
      [
        {
          policy_id: "p1",
          coverage_type: "physical_damage",
          status: "active",
          effective_date: "2026-01-01",
          expiry_date: "2026-12-31",
        },
        {
          policy_id: "p2",
          coverage_type: "cargo",
          status: "active",
          effective_date: "2026-01-01",
          expiry_date: "2026-12-31",
        },
      ],
      {
        asOfDate: "2026-05-01",
        requiredTypes: requiredCoverageTypesForAssetType("reefer"),
      }
    );

    expect(result.required_types).toEqual(["physical_damage", "cargo"]);
    expect(result.is_covered).toBe(true);
    expect(result.gap_types).toEqual([]);
  });
});
