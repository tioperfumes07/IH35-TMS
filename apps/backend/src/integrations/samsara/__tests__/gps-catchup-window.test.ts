import { describe, expect, it, vi } from "vitest";

/**
 * LEAD 443.232 (P0 catch-up) — the lost window is replayed through the live path: every Samsara GPS fix is stored and, when
 * new, run through the fence detector in its own savepoint; one unit's fence failure never stops the replay.
 */
const h = vi.hoisted(() => ({ ingest: vi.fn(), fence: vi.fn(), history: vi.fn() }));
vi.mock("../samsara.service.js", () => ({ getSamsaraConfigForCompany: vi.fn(async () => ({ is_enabled: true, samsara_org_id: "o" })) }));
vi.mock("../samsara-token.js", () => ({ resolveSamsaraApiToken: () => "t" }));
vi.mock("../../../telematics/vehicle-locations.service.js", async (orig) => ({ ...(await orig<object>()), ingestVehicleLocationEvent: h.ingest }));
vi.mock("../../../telematics/geofence-detector.service.js", () => ({ processGeofenceDetectionsForGpsPoint: h.fence }));
vi.mock("../samsara-client.js", async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return { ...real, SamsaraClient: class { listGpsHistory = h.history; } };
});
const { catchUpSamsaraGpsWindow } = await import("../samsara-positions.service.js");

const fix = (id: string, t: string) => ({ id, latitude: 42.5, longitude: -71.1, captured_at: t, speed_mph: 50, heading_deg: 10, engine_on: null, odometer_mi: null, formatted_location: "Wilmington, MA", raw: {} });

describe("443.232 catch-up — replay the lost window through the live path", () => {
  it("stores each fix, runs the fence detector per new fix in a savepoint, and survives one unit's failure", async () => {
    h.history.mockResolvedValue([fix("v1", "2026-10-22T06:00:00.000Z"), fix("v2", "2026-10-22T06:05:00.000Z"), fix("v9", "2026-10-22T06:06:00.000Z")]);
    h.ingest.mockReset().mockResolvedValue(true);
    h.fence.mockReset().mockRejectedValueOnce(new Error("boom")).mockResolvedValue({ checked_geofences: 1, transitions_written: 1, stop_arrivals_stamped: 1 });
    const sql: string[] = [];
    const client = {
      query: vi.fn(async (q: string) => {
        sql.push(q);
        if (q.includes("samsara_vehicle_id")) return { rows: [{ samsara_vehicle_id: "v1", unit_id: "u1" }, { samsara_vehicle_id: "v2", unit_id: "u2" }] };
        return { rows: [] };
      }),
    };
    const r = await catchUpSamsaraGpsWindow(client as never, "5c854333-6ea5-4faa-af31-67cb272fef80", "2026-10-22T05:10:00Z", "2026-10-22T14:50:00Z");
    expect(r.fetched).toBe(3);
    expect(r.inserted).toBe(2);
    expect(r.skipped_no_unit).toBe(1);
    expect(r.arrivals_triggered).toBe(1);
    expect(r.errors).toEqual(["fence:u1:boom"]);
    expect(h.ingest.mock.calls[0]![1]).toMatchObject({ unit_id: "u1", raw_samsara_event_id: "catchup:gps:v1:2026-10-22T06:00:00.000Z" });
    expect(sql).toContain("ROLLBACK TO SAVEPOINT catchup_fence_point");
  });
});
