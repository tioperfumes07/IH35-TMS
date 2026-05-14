import { describe, expect, it } from "vitest";
import { computeMaintenanceUnitFlags } from "../maintenance-cost-per-unit.routes.js";

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
