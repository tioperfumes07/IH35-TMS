import { describe, expect, it } from "vitest";
import { deriveFuelRecommendations } from "../fuel-stop-planner.service.js";

describe("fuel stop planner low fuel trigger", () => {
  it("adds recommendation when remaining fuel falls below threshold", () => {
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
          estimated_route_mile: 100,
        },
      ],
      hos: null,
      currentFuelGallons: 20,
      mpg: 5,
      avgSpeedMph: 60,
      safetyThresholdMiles: 50,
    });

    expect(recommendations.some((rec) => rec.reason === "low_fuel")).toBe(true);
  });
});
