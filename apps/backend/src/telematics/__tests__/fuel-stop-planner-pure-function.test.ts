import { describe, expect, it } from "vitest";
import { deriveFuelRecommendations } from "../fuel-stop-planner.service.js";

describe("fuel stop planner pure function", () => {
  it("returns ordered recommendations with rationale", () => {
    const recommendations = deriveFuelRecommendations({
      stops: [
        {
          stop_id: "s1",
          sequence_number: 1,
          city: "Austin",
          state: "TX",
          latitude: null,
          longitude: null,
          scheduled_arrival_at: null,
          estimated_route_mile: 150,
        },
      ],
      hos: {
        drive_remaining_min: 600,
        window_remaining_min: 700,
        break_remaining_min: 300,
        cycle_remaining_min: 2000,
        last_reset_at: null,
        status: "ok",
      },
      currentFuelGallons: 20,
      mpg: 6.5,
      avgSpeedMph: 60,
      safetyThresholdMiles: 50,
    });

    expect(recommendations.length).toBe(1);
    expect(recommendations[0]?.reason).toBe("low_fuel");
  });
});
