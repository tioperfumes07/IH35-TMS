import { describe, expect, it, vi } from "vitest";
import { processDotDwellForGeofenceEvent } from "../dot-dwell-detector.service.js";

describe("dot dwell detector ignores non-dot geofences", () => {
  it("does not insert when geofence is not dot inspection kind", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM geo.geofences g")) return { rows: [] };
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

    expect(result).toBe(false);
    expect(client.query).not.toHaveBeenCalledWith(expect.stringContaining("INSERT INTO compliance.dot_inspection_events"), expect.any(Array));
  });
});
