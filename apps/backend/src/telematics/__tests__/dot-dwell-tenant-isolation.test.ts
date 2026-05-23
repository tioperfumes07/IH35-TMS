import { describe, expect, it, vi } from "vitest";
import { processDotDwellForGeofenceEvent } from "../dot-dwell-detector.service.js";

describe("dot dwell tenant isolation", () => {
  it("scopes reads and writes by operating_company_id", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (sql.includes("FROM geo.geofences g")) return { rows: [{ id: "geo-1" }] };
        if (sql.includes("FROM geo.geofence_events ge")) return { rows: [{ occurred_at: "2026-05-23T10:00:00.000Z", driver_id: null }] };
        return { rows: [] };
      }),
    };

    await processDotDwellForGeofenceEvent(client, {
      operating_company_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      geofence_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      unit_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      driver_id: null,
      event_kind: "exited",
      occurred_at: "2026-05-23T10:06:00.000Z",
    });

    const readGeofence = calls.find((c) => c.sql.includes("FROM geo.geofences g"));
    expect(readGeofence?.params[0]).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

    const insert = calls.find((c) => c.sql.includes("INSERT INTO compliance.dot_inspection_events"));
    expect(insert?.params[0]).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  });
});
