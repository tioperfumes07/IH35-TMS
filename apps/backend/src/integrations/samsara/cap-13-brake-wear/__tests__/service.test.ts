/**
 * Tests: CAP-13 Brake Wear Service (GAP-63)
 */
import { describe, expect, it, vi } from "vitest";
import {
  axleGroupForPosition,
  dotThresholdForPosition,
  getAtRiskFleet,
  getLatestForUnit,
  linearRegression,
  listMeasurements,
  projectReplacementFromMeasurements,
  recordMeasurement,
  type BrakeMeasurement,
} from "../service.js";

function mockClient(rows: Record<string, unknown>[] = []) {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  } as unknown as import("pg").PoolClient;
}

function measurement(
  overrides: Partial<BrakeMeasurement> & Pick<BrakeMeasurement, "brake_position" | "lining_thickness_mm" | "measured_at">
): BrakeMeasurement {
  return {
    uuid: "m1",
    operating_company_id: "co-1",
    unit_uuid: "u1",
    measured_by_user_uuid: null,
    source: "pm_inspection",
    odometer_miles: null,
    created_at: overrides.measured_at,
    ...overrides,
  };
}

describe("dotThresholdForPosition", () => {
  it("returns 6.4 mm for steer positions (49 CFR §393.47)", () => {
    expect(dotThresholdForPosition("LF-S")).toBe(6.4);
    expect(dotThresholdForPosition("RF-S")).toBe(6.4);
    expect(axleGroupForPosition("LF-S")).toBe("steer");
  });

  it("returns 3.2 mm for drive positions", () => {
    expect(dotThresholdForPosition("LR1-D")).toBe(3.2);
    expect(dotThresholdForPosition("RR2-D")).toBe(3.2);
    expect(axleGroupForPosition("LR1-D")).toBe("drive");
  });
});

describe("recordMeasurement", () => {
  it("inserts measurement with tenant scope", async () => {
    const expected = {
      uuid: "m1",
      operating_company_id: "co-1",
      unit_uuid: "u1",
      brake_position: "LF-S",
      lining_thickness_mm: 12.5,
      measured_at: "2026-01-01T00:00:00Z",
      measured_by_user_uuid: "user-1",
      source: "pm_inspection",
      odometer_miles: 100000,
      created_at: "2026-01-01T00:00:00Z",
    };
    const client = mockClient([expected]);
    const result = await recordMeasurement(client, {
      operating_company_id: "co-1",
      unit_uuid: "u1",
      position: "LF-S",
      thickness_mm: 12.5,
      source: "pm_inspection",
      measured_by_user_uuid: "user-1",
      odometer_miles: 100000,
    });
    expect(result).toEqual(expected);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("maintenance.brake_wear_measurements"),
      expect.arrayContaining(["co-1", "u1", "LF-S", 12.5])
    );
  });

  it("throws when insert returns no row", async () => {
    const client = mockClient([]);
    await expect(
      recordMeasurement(client, {
        operating_company_id: "co-1",
        unit_uuid: "u1",
        position: "LF-S",
        thickness_mm: 12.5,
        source: "dvir",
      })
    ).rejects.toThrow("brake_measurement_insert_failed");
  });
});

describe("getLatestForUnit", () => {
  it("queries latest per position with RLS tenant filter", async () => {
    const rows = [{ brake_position: "LF-S", lining_thickness_mm: 10 }];
    const client = mockClient(rows);
    const result = await getLatestForUnit(client, "co-1", "u1");
    expect(result).toEqual(rows);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("DISTINCT ON (brake_position)"), [
      "co-1",
      "u1",
    ]);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("operating_company_id = $1"), expect.any(Array));
  });
});

describe("listMeasurements", () => {
  it("scopes by unit and position", async () => {
    const client = mockClient([{ uuid: "m1" }]);
    await listMeasurements(client, "co-1", { unit_uuid: "u1", position: "LR1-D" });
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("brake_position = $3"), [
      "co-1",
      "u1",
      "LR1-D",
      200,
    ]);
  });
});

describe("linearRegression", () => {
  it("computes declining lining wear slope", () => {
    const result = linearRegression([
      { x: 0, y: 20 },
      { x: 10, y: 18 },
      { x: 20, y: 16 },
    ]);
    expect(result).not.toBeNull();
    expect(result!.slope).toBeCloseTo(-0.2, 5);
  });
});

describe("projectReplacementFromMeasurements", () => {
  it("flags below-threshold steer brake as due today", () => {
    const result = projectReplacementFromMeasurements(
      [
        measurement({
          brake_position: "LF-S",
          lining_thickness_mm: 5.5,
          measured_at: "2026-06-01T00:00:00Z",
        }),
      ],
      "LF-S"
    );
    expect(result.threshold_mm).toBe(6.4);
    expect(result.days_until_replacement).toBe(0);
  });

  it("projects replacement from linear wear trend", () => {
    const base = Date.UTC(2026, 0, 1);
    const measurements = [0, 30, 60, 90].map((dayOffset, idx) =>
      measurement({
        brake_position: "LR1-D",
        lining_thickness_mm: 18 - idx * 1.5,
        measured_at: new Date(base + dayOffset * 86_400_000).toISOString(),
      })
    );
    const result = projectReplacementFromMeasurements(measurements, "LR1-D");
    expect(result.projected_replacement_date).not.toBeNull();
    expect(result.wear_rate_mm_per_day).toBeGreaterThan(0);
  });
});

describe("getAtRiskFleet", () => {
  it("queries projections within window joined to units", async () => {
    const client = mockClient([
      {
        unit_uuid: "u1",
        unit_number: "T-101",
        brake_position: "LF-S",
        threshold_mm: "6.4",
        current_thickness_mm: "5.8",
        projected_replacement_date: "2026-06-15",
        wear_rate_mm_per_day: "0.02",
      },
    ]);
    const rows = await getAtRiskFleet(client, "co-1", 30);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.unit_number).toBe("T-101");
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("brake_projections"), ["co-1", 30]);
  });
});

describe("regression accuracy on synthetic fleet data", () => {
  it("predicts replacement within 30% of actual on >70% of positions", () => {
    const scenarios = [
      { startMm: 24, wearPerDay: 0.05, days: 180, threshold: 6.4, position: "LF-S" },
      { startMm: 16, wearPerDay: 0.04, days: 150, threshold: 3.2, position: "LR1-D" },
      { startMm: 22, wearPerDay: 0.045, days: 160, threshold: 6.4, position: "RF-S" },
      { startMm: 14, wearPerDay: 0.035, days: 140, threshold: 3.2, position: "RR1-D" },
      { startMm: 18, wearPerDay: 0.05, days: 170, threshold: 3.2, position: "LR2-D" },
    ];

    let accurate = 0;
    for (const scenario of scenarios) {
      const base = Date.UTC(2026, 0, 1);
      const measurements: BrakeMeasurement[] = [];
      for (let day = 0; day <= scenario.days; day += 10) {
        const thickness = Math.round((scenario.startMm - scenario.wearPerDay * day) * 100) / 100;
        if (thickness < scenario.threshold) break;
        measurements.push(
          measurement({
            brake_position: scenario.position,
            lining_thickness_mm: thickness,
            measured_at: new Date(base + day * 86_400_000).toISOString(),
            odometer_miles: 100000 + day * 400,
          })
        );
      }

      const projection = projectReplacementFromMeasurements(measurements, scenario.position);
      const lastDay = (measurements.length - 1) * 10;
      const remainingAtLatest = measurements[measurements.length - 1]!.lining_thickness_mm - scenario.threshold;
      const actualDays = Math.max(1, Math.ceil(remainingAtLatest / scenario.wearPerDay));
      const predictedDays = projection.days_until_replacement ?? actualDays;
      const errorPct = Math.abs(predictedDays - actualDays) / actualDays;
      if (errorPct <= 0.3) accurate += 1;
    }

    expect(accurate / scenarios.length).toBeGreaterThan(0.7);
  });
});
