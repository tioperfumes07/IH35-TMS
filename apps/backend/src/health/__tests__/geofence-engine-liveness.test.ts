import { describe, expect, it, vi } from "vitest";
import { findStuckDepartedGeofences } from "../health.routes.js";

/**
 * GEOFENCE-DEPARTED-STUCK (owner 2026-09-09) — regression guard for the exact live incident: a
 * geofence's per-vehicle state (geo.geofence_vehicle_state, the GAP-39 2026-09-05 rebuild's
 * source of truth — geo.geofences.current_state is deprecated and no longer written) can get
 * stuck at 'departed' the same way the old shared column once did, via the one remaining illegal
 * edge (departed -> at on a fast single-tick return) that transitions.service.ts silently drops.
 */
describe("findStuckDepartedGeofences", () => {
  it("flags a (geofence, unit) pair stuck 'departed' when a newer ping lands inside the fence's enter radius", async () => {
    const rows = [
      {
        geofence_id: "188cf90c-d970-4ab0-9795-d23394b38af1",
        unit_id: "ea1b0fe4-1731-49ca-a50a-3363dfc76ae4",
        state_updated_at: "2026-09-03T19:06:32.497Z",
        newest_nearby_ping: "2026-09-09T02:24:18.000Z",
      },
    ];
    const client = { query: vi.fn(async () => ({ rows })) };

    const result = await findStuckDepartedGeofences(client, "5c854333-6ea5-4faa-af31-67cb272fef80");

    expect(result).toEqual(rows);
    expect(client.query).toHaveBeenCalledTimes(1);
    const [sql, values] = vi.mocked(client.query).mock.calls[0]!;
    expect(String(sql)).toContain("current_state = 'departed'");
    expect(String(sql)).toContain("geo.geofence_vehicle_state");
    expect(String(sql)).toContain("telematics.vehicle_locations");
    expect(values).toEqual(["5c854333-6ea5-4faa-af31-67cb272fef80"]);
  });

  it("returns empty when the query finds no stuck pair (the honest, common case)", async () => {
    const client = { query: vi.fn(async () => ({ rows: [] })) };

    const result = await findStuckDepartedGeofences(client, "5c854333-6ea5-4faa-af31-67cb272fef80");

    expect(result).toEqual([]);
  });
});
