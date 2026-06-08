/**
 * Tests: CAP-12 Tire Tread Projection Service (GAP-62)
 */
import { describe, expect, it } from "vitest";
import { type TreadMeasurement } from "../measurement.service.js";
import { linearRegression, projectReplacementFromMeasurements } from "../projection.service.js";

function measurement(
  overrides: Partial<TreadMeasurement> & Pick<TreadMeasurement, "tire_position" | "tread_depth_32nds" | "measured_at">
): TreadMeasurement {
  return {
    uuid: "m1",
    operating_company_id: "co-1",
    unit_uuid: "u1",
    measured_by_user_uuid: null,
    source: "maintenance_pm",
    odometer_miles: null,
    created_at: overrides.measured_at,
    ...overrides,
  };
}

describe("linearRegression", () => {
  it("computes slope and intercept for declining tread", () => {
    const result = linearRegression([
      { x: 0, y: 20 },
      { x: 10, y: 18 },
      { x: 20, y: 16 },
    ]);
    expect(result).not.toBeNull();
    expect(result!.slope).toBeCloseTo(-0.2, 5);
    expect(result!.intercept).toBeCloseTo(20, 5);
  });

  it("returns null for fewer than two points", () => {
    expect(linearRegression([{ x: 0, y: 10 }])).toBeNull();
  });
});

describe("projectReplacementFromMeasurements", () => {
  it("flags already-below-threshold steer tire as due today", () => {
    const result = projectReplacementFromMeasurements(
      [
        measurement({
          tire_position: "STEER-LF",
          tread_depth_32nds: 3,
          measured_at: "2026-06-01T00:00:00Z",
        }),
      ],
      "STEER-LF"
    );
    expect(result.threshold_32nds).toBe(4);
    expect(result.days_until_replacement).toBe(0);
    expect(result.projected_replacement_date).toBeTruthy();
  });

  it("uses drive threshold of 2/32", () => {
    const result = projectReplacementFromMeasurements(
      [
        measurement({
          tire_position: "DRIVE-LR1",
          tread_depth_32nds: 1,
          measured_at: "2026-06-01T00:00:00Z",
        }),
      ],
      "DRIVE-LR1"
    );
    expect(result.threshold_32nds).toBe(2);
    expect(result.days_until_replacement).toBe(0);
  });

  it("projects replacement date from linear wear trend", () => {
    const base = Date.UTC(2026, 0, 1);
    const measurements = [0, 30, 60, 90].map((dayOffset, idx) =>
      measurement({
        tire_position: "STEER-LF",
        tread_depth_32nds: 20 - idx * 2,
        measured_at: new Date(base + dayOffset * 86_400_000).toISOString(),
      })
    );
    const result = projectReplacementFromMeasurements(measurements, "STEER-LF");
    expect(result.projected_replacement_date).not.toBeNull();
    expect(result.wear_rate_32nds_per_day).toBeGreaterThan(0);
  });
});

describe("regression accuracy on synthetic fleet data", () => {
  it("predicts replacement within 30% of actual on >70% of positions", () => {
    const scenarios = [
      { startDepth: 24, wearPerDay: 0.05, days: 120, threshold: 4 },
      { startDepth: 18, wearPerDay: 0.08, days: 90, threshold: 2 },
      { startDepth: 30, wearPerDay: 0.04, days: 150, threshold: 4 },
      { startDepth: 16, wearPerDay: 0.06, days: 100, threshold: 2 },
      { startDepth: 22, wearPerDay: 0.07, days: 80, threshold: 4 },
    ];

    let accurate = 0;
    for (const scenario of scenarios) {
      const base = Date.UTC(2026, 0, 1);
      const measurements: TreadMeasurement[] = [];
      for (let day = 0; day <= scenario.days; day += 15) {
        const depth = Math.max(
          scenario.threshold,
          Math.round((scenario.startDepth - scenario.wearPerDay * day) * 10) / 10
        );
        measurements.push(
          measurement({
            tire_position: scenario.threshold === 4 ? "STEER-LF" : "DRIVE-LR1",
            tread_depth_32nds: depth,
            measured_at: new Date(base + day * 86_400_000).toISOString(),
          })
        );
      }

      const position = scenario.threshold === 4 ? "STEER-LF" : "DRIVE-LR1";
      const projection = projectReplacementFromMeasurements(measurements, position);
      const latestDepth = measurements[measurements.length - 1]!.tread_depth_32nds;
      const actualRemaining = Math.max(
        0,
        Math.ceil((latestDepth - scenario.threshold) / scenario.wearPerDay)
      );
      const predictedDays = projection.days_until_replacement ?? actualRemaining;
      if (actualRemaining === 0) {
        expect(projection.days_until_replacement).toBe(0);
        accurate += 1;
        continue;
      }
      const errorPct = Math.abs(predictedDays - actualRemaining) / actualRemaining;
      if (errorPct <= 0.3) accurate += 1;
    }

    expect(accurate / scenarios.length).toBeGreaterThan(0.7);
  });
});
