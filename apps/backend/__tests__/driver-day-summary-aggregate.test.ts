import { describe, expect, it } from "vitest";
import { aggregateDriverDaySummaryFromFixtures } from "../src/telematics/driver-day-summary.service.js";

describe("driver-day-summary aggregate fixture", () => {
  it("aggregates miles, duty, fuel, and arrivals by driver", () => {
    const rows = aggregateDriverDaySummaryFromFixtures({
      positions: [
        { driver_id: "d1", captured_at: "2026-05-23T10:00:00.000Z", lat: 30.2672, lng: -97.7431 },
        { driver_id: "d1", captured_at: "2026-05-23T10:30:00.000Z", lat: 30.3000, lng: -97.7000 },
        { driver_id: "d2", captured_at: "2026-05-23T11:00:00.000Z", lat: 29.7604, lng: -95.3698 },
        { driver_id: "d2", captured_at: "2026-05-23T11:45:00.000Z", lat: 29.8000, lng: -95.3400 },
      ],
      duty: [
        { driver_id: "d1", minutes_on_duty: 300 },
        { driver_id: "d2", minutes_on_duty: 180 },
      ],
      fuelStops: [{ driver_id: "d1" }, { driver_id: "d1" }, { driver_id: "d2" }],
      arrivals: [
        { driver_id: "d1", on_time: true },
        { driver_id: "d1", on_time: false },
        { driver_id: "d2", on_time: true },
      ],
      driverNames: { d1: "Alex Driver", d2: "Blake Operator" },
    });

    expect(rows).toHaveLength(2);
    const d1 = rows.find((row) => row.driver_id === "d1");
    expect(d1).toMatchObject({
      driver_name: "Alex Driver",
      hours_on_duty: 5,
      fuel_stops: 2,
      on_time_arrivals: 1,
      late_arrivals: 1,
    });
    expect((d1?.miles ?? 0) > 0).toBe(true);
  });
});
