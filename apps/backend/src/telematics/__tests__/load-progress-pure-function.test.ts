import { describe, expect, it } from "vitest";
import { computeEtaDeltaMinutes, haversineMiles } from "../load-progress.service.js";

describe("load progress pure math", () => {
  it("computes eta delta minutes from distance and speed", () => {
    const delta = computeEtaDeltaMinutes({
      distance_miles: 60,
      gps_occurred_at: "2026-05-23T20:00:00.000Z",
      scheduled_arrival_at: "2026-05-23T20:30:00.000Z",
    });
    expect(delta).toBe(30);
  });

  it("returns small distance for close points", () => {
    const miles = haversineMiles(30.2672, -97.7431, 30.26721, -97.74311);
    expect(miles).toBeLessThan(0.01);
  });
});
