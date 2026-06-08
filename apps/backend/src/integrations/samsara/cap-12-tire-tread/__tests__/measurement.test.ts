/**
 * Tests: CAP-12 Tire Tread Measurement Service (GAP-62)
 */
import { describe, expect, it, vi } from "vitest";
import {
  dotThresholdForPosition,
  getLatestForUnit,
  listMeasurements,
  recordMeasurement,
} from "../measurement.service.js";

function mockClient(rows: Record<string, unknown>[] = []) {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  } as unknown as import("pg").PoolClient;
}

describe("dotThresholdForPosition", () => {
  it("returns 4/32 for steer positions", () => {
    expect(dotThresholdForPosition("STEER-LF")).toBe(4);
    expect(dotThresholdForPosition("STEER-RF")).toBe(4);
  });

  it("returns 2/32 for drive and trailer positions", () => {
    expect(dotThresholdForPosition("DRIVE-LR1")).toBe(2);
    expect(dotThresholdForPosition("TRAILER-L1")).toBe(2);
  });
});

describe("recordMeasurement", () => {
  it("inserts measurement and returns row", async () => {
    const expected = {
      uuid: "m1",
      operating_company_id: "co-1",
      unit_uuid: "u1",
      tire_position: "STEER-LF",
      tread_depth_32nds: 12,
      measured_at: "2026-01-01T00:00:00Z",
      measured_by_user_uuid: "user-1",
      source: "dvir_inspection",
      odometer_miles: 100000,
      created_at: "2026-01-01T00:00:00Z",
    };
    const client = mockClient([expected]);
    const result = await recordMeasurement(client, {
      operating_company_id: "co-1",
      unit_uuid: "u1",
      position: "STEER-LF",
      depth_32nds: 12,
      source: "dvir_inspection",
      measured_by_user_uuid: "user-1",
      odometer_miles: 100000,
    });
    expect(result).toEqual(expected);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("maintenance.tire_tread_measurements"),
      expect.arrayContaining(["co-1", "u1", "STEER-LF", 12])
    );
  });

  it("throws when insert returns no row", async () => {
    const client = mockClient([]);
    await expect(
      recordMeasurement(client, {
        operating_company_id: "co-1",
        unit_uuid: "u1",
        position: "STEER-LF",
        depth_32nds: 12,
        source: "maintenance_pm",
      })
    ).rejects.toThrow("tread_measurement_insert_failed");
  });
});

describe("getLatestForUnit", () => {
  it("queries latest per position with tenant scope", async () => {
    const rows = [{ tire_position: "STEER-LF", tread_depth_32nds: 10 }];
    const client = mockClient(rows);
    const result = await getLatestForUnit(client, "co-1", "u1");
    expect(result).toEqual(rows);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("DISTINCT ON (tire_position)"), [
      "co-1",
      "u1",
    ]);
  });
});

describe("listMeasurements", () => {
  it("scopes by unit and position", async () => {
    const client = mockClient([{ uuid: "m1" }]);
    await listMeasurements(client, "co-1", { unit_uuid: "u1", position: "DRIVE-LR1" });
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("tire_position = $3"), [
      "co-1",
      "u1",
      "DRIVE-LR1",
      200,
    ]);
  });
});
