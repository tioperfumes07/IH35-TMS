import { describe, expect, it } from "vitest";
import { deriveFuelRecommendations } from "../fuel-stop-planner.service.js";

describe("fuel stop planner HOS trigger", () => {
  it("recommends stop when drive clock forces reset window", () => {
    const recommendations = deriveFuelRecommendations({
      stops: [
        {
          stop_id: "s1",
          sequence_number: 1,
          city: "Waco",
          state: "TX",
          latitude: null,
          longitude: null,
          scheduled_arrival_at: null,
          estimated_route_mile: 500,
        },
      ],
      hos: {
        drive_remaining_min: 240,
        window_remaining_min: 300,
        break_remaining_min: 120,
        cycle_remaining_min: 2000,
        last_reset_at: null,
        status: "warning_1hr",
      },
      currentFuelGallons: 200,
      mpg: 6.5,
      avgSpeedMph: 60,
      safetyThresholdMiles: 50,
    });

    expect(recommendations.length).toBe(1);
    expect(recommendations[0]?.reason).toBe("ten_hour_reset_window");
  });
});
