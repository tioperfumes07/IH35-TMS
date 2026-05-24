import { describe, expect, it, vi } from "vitest";
import { ingestVehicleLocationEvent } from "../vehicle-locations.service.js";

describe("vehicle locations tenant isolation", () => {
  it("writes with operating_company_id in insert and conflict key", async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      query: vi.fn(async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        return { rows: [], rowCount: 1 };
      }),
    };
    await ingestVehicleLocationEvent(client as never, {
      operating_company_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      unit_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      samsara_vehicle_id: "sv-1",
      captured_at: "2026-05-24T00:00:00.000Z",
      lat: 30,
      lng: -97,
      speed_mph: null,
      heading_deg: null,
      engine_state: "unknown",
      raw_samsara_event_id: "evt-tenant",
      payload: {},
    });

    const insert = calls.find((entry) => entry.sql.includes("INSERT INTO telematics.vehicle_locations"));
    expect(insert?.sql).toContain("operating_company_id");
    expect(insert?.sql).toContain("ON CONFLICT (operating_company_id, raw_samsara_event_id) DO NOTHING");
    expect(insert?.values?.[0]).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  });
});
