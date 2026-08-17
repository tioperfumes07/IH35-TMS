import { describe, expect, it } from "vitest";
import { computeMaintenanceUnitFlags, toMaintenanceCostRunnerRow } from "../maintenance-cost-per-unit.routes.js";

describe("maintenance cost per unit flags", () => {
  it("marks inspection due independently of spend", () => {
    const flags = computeMaintenanceUnitFlags({
      totalCents: 0,
      woCount: 0,
      p75: 1,
      p25: 1,
      median: 1,
      miles: 0,
      inspectionDue: true,
    });
    expect(flags).toContain("inspection_due");
  });

  it("labels high spend units against the p75 benchmark", () => {
    const flags = computeMaintenanceUnitFlags({
      totalCents: 200,
      woCount: 2,
      p75: 150,
      p25: 10,
      median: 120,
      miles: 600,
      inspectionDue: false,
    });
    expect(flags).toContain("high_cost");
  });

  it("marks reliable trucks when workload and spend are tame", () => {
    const flags = computeMaintenanceUnitFlags({
      totalCents: 50,
      woCount: 4,
      p75: 500,
      p25: 40,
      median: 200,
      miles: 600,
      inspectionDue: false,
    });
    expect(flags).toContain("reliable");
  });
});

describe("maintenance cost per unit runner projection", () => {
  it("preserves the canonical unit id required by the runner EntityLink", () => {
    expect(toMaintenanceCostRunnerRow({
      unit_id: "1a3c98da-1fb1-4302-8ca8-87e276a1aaa9",
      unit_number: "T149",
      wo_count: 3,
      parts_cents: 5_000,
      labor_cents: 5_005,
      outsourced_cents: 0,
      total_cents: 10_005,
      miles_driven: 0,
      cost_per_mile_cents: null,
      avg_wo_cents: 3_335,
      max_single_wo_cents: 10_005,
      flags: [],
    })).toEqual({
      unit_id: "1a3c98da-1fb1-4302-8ca8-87e276a1aaa9",
      unit_number: "T149",
      total_cost_cents: 10_005,
      wo_count: 3,
      avg_cost_per_wo_cents: 3_335,
    });
  });
});
