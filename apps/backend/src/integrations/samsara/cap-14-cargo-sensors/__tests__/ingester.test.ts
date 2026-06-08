/**
 * Tests: CAP-14 Cargo Sensor Ingester (GAP-64)
 */
import { describe, expect, it, vi } from "vitest";
import { evaluateCargoThreshold, resolveCargoThresholds } from "../threshold.service.js";
import { runCargoSensorIngestionForCompany, upsertCargoSensorReading } from "../ingester.service.js";

function mockClient(rows: Record<string, unknown>[] = []) {
  return { query: vi.fn().mockResolvedValue({ rows }) };
}

describe("resolveCargoThresholds", () => {
  it("uses required min/max when present", () => {
    const range = resolveCargoThresholds({ required_temp_min: 0, required_temp_max: 5 });
    expect(range.min_temp_c).toBe(0);
    expect(range.max_temp_c).toBe(5);
  });
});

describe("evaluateCargoThreshold", () => {
  it("flags out-of-range readings", () => {
    const range = resolveCargoThresholds({ required_temp_min: 0, required_temp_max: 5 });
    expect(evaluateCargoThreshold({ temp_celsius: 8, humidity_pct: null, reading_at: new Date().toISOString() }, range).out_of_range).toBe(true);
  });
});

describe("upsertCargoSensorReading", () => {
  it("persists reading with tenant scope", async () => {
    const expected = {
      uuid: "r1",
      operating_company_id: "co-1",
      load_uuid: "load-1",
      trailer_uuid: "trailer-1",
      sensor_id: "s1",
      temp_celsius: 3,
      humidity_pct: 50,
      door_status: "closed" as const,
      reading_at: "2026-06-08T12:00:00Z",
      out_of_range: false,
      created_at: "2026-06-08T12:00:00Z",
    };
    const client = mockClient([expected]);
    const row = await upsertCargoSensorReading(client as never, {
      operating_company_id: "co-1",
      load_uuid: "load-1",
      trailer_uuid: "trailer-1",
      sensor_id: "s1",
      temp_celsius: 3,
      humidity_pct: 50,
      door_status: "closed",
      reading_at: "2026-06-08T12:00:00Z",
      out_of_range: false,
    });
    expect(row.uuid).toBe("r1");
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("dispatch.cargo_sensor_readings"), expect.any(Array));
  });
});

describe("runCargoSensorIngestionForCompany", () => {
  it("pulls provider samples and persists", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ load_uuid: "load-1", operating_company_id: "co-1", trailer_uuid: "trailer-1", load_metadata: {} }],
        })
        .mockResolvedValueOnce({
          rows: [{
            uuid: "r1", operating_company_id: "co-1", load_uuid: "load-1", trailer_uuid: "trailer-1",
            sensor_id: "s1", temp_celsius: 3, humidity_pct: 50, door_status: "closed",
            reading_at: "2026-06-08T12:00:00Z", out_of_range: false, created_at: "2026-06-08T12:00:00Z",
          }],
        }),
    };
    const result = await runCargoSensorIngestionForCompany(client as never, "co-1", async () => [{
      operating_company_id: "co-1",
      load_uuid: "load-1",
      trailer_uuid: "trailer-1",
      sensor_id: "s1",
      temp_celsius: 3,
      humidity_pct: 50,
      door_status: "closed",
      reading_at: "2026-06-08T12:00:00Z",
    }]);
    expect(result.readings_ingested).toBe(1);
  });
});
