import { describe, expect, it } from "vitest";
import { ARRIVAL_RADIUS_FEET, haversineFeet, shouldTriggerArrival } from "../arrival-detection.service.js";

describe("arrival haversine distance", () => {
  it("returns near-zero for identical coordinates", () => {
    const distance = haversineFeet(30.2672, -97.7431, 30.2672, -97.7431);
    expect(distance).toBeLessThan(1);
  });

  it("keeps trigger decisions locked to 250ft radius", () => {
    expect(ARRIVAL_RADIUS_FEET).toBe(250);
    expect(shouldTriggerArrival(249, null, "2026-05-23T20:00:00.000Z")).toBe(true);
    expect(shouldTriggerArrival(251, null, "2026-05-23T20:00:00.000Z")).toBe(false);
  });
});
