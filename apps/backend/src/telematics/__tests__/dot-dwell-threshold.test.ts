import { describe, expect, it, vi } from "vitest";
import { processDotDwellForGeofenceEvent } from "../dot-dwell-detector.service.js";

describe("dot dwell threshold", () => {
  it("inserts compliance event when dwell is >= 5 minutes", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM geo.geofences g")) return { rows: [{ id: "geo-1" }] };
        if (sql.includes("FROM geo.geofence_events ge")) return { rows: [{ occurred_at: "2026-05-23T10:00:00.000Z", driver_id: null }] };
        return { rows: [] };
      }),
    };

    const result = await processDotDwellForGeofenceEvent(client, {
      operating_company_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      geofence_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      unit_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      driver_id: null,
      event_kind: "exited",
      occurred_at: "2026-05-23T10:05:00.000Z",
    });

    expect(result).toBe(true);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO compliance.dot_inspection_events"), expect.any(Array));
  });
});
