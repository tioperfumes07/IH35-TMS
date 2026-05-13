import { describe, expect, it } from "vitest";
import { gaugeFillForUtilization } from "./FleetUtilizationGauge";

describe("FleetUtilizationGauge thresholds", () => {
  it("uses red below 50%, gold through 75%, green above 75%", () => {
    expect(gaugeFillForUtilization(40).active).toBe("#dc2626");
    expect(gaugeFillForUtilization(60).active).toBe("#ca8a04");
    expect(gaugeFillForUtilization(80).active).toBe("#1A7A3C");
    expect(gaugeFillForUtilization(50).active).toBe("#ca8a04");
    expect(gaugeFillForUtilization(76).active).toBe("#1A7A3C");
  });

  it("uses neutral gray for the remainder slice (print-friendly base)", () => {
    expect(gaugeFillForUtilization(33).rest).toBe("#e5e7eb");
  });
});
