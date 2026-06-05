import { describe, expect, it } from "vitest";
import { buildWoOosDowntimeEstimate, computeDowntimeCostCents, isOosSevereSeverity } from "./wo-oos-estimator.js";

describe("wo-oos-estimator", () => {
  it("flags out_of_service severity as OOS-severe", () => {
    expect(isOosSevereSeverity("out_of_service")).toBe(true);
    expect(isOosSevereSeverity("severe")).toBe(false);
  });

  it("computes downtime cost as days_oos × daily_loss_per_truck", () => {
    expect(computeDowntimeCostCents(3, 50_000)).toBe(150_000);
    const estimate = buildWoOosDowntimeEstimate({
      work_order_id: "wo-1",
      unit_id: "unit-1",
      severity: "out_of_service",
      days_oos: 2.5,
      repair_estimate_cents: 80_000,
      daily_loss_cents: 40_000,
    });
    expect(estimate?.downtime_cost_cents).toBe(100_000);
    expect(estimate?.combined_cost_cents).toBe(180_000);
  });
});
