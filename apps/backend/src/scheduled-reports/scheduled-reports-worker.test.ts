import { describe, expect, it } from "vitest";
import { computeDeliveryPeriod } from "./next-run.js";

describe("scheduled-reports worker helpers", () => {
  it("labels delivery periods for daily cadence", () => {
    const from = new Date("2026-01-15T12:00:00.000Z");
    const period = computeDeliveryPeriod("daily", "America/Chicago", from);
    expect(period.label.toLowerCase()).toContain("daily");
    expect(period.startIso.length).toBeGreaterThan(4);
    expect(period.endIso.length).toBeGreaterThan(4);
  });
});
