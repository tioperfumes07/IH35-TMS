import { afterEach, describe, expect, it, vi } from "vitest";
import { pushFencesToSamsara } from "../fence-push.service.js";

const FENCES = [
  { id: "f1", label: "Juárez–Lincoln International Bridge (Laredo II)", location_kind: "border_crossing", lat: 27.5, lng: -99.5, radius_m: 225 },
  { id: "f2", label: "Love's #1", location_kind: "fuel_stop", lat: 30, lng: -97, radius_m: 200 },
];
function db() {
  const updates: unknown[][] = [];
  return { updates, query: async (sql: string, v?: unknown[]) => {
    if (sql.includes("FROM geo.geofences")) return { rows: FENCES };
    if (sql.includes("UPDATE geo.geofences")) updates.push(v ?? []);
    return { rows: [] };
  } };
}

describe("E-07 addition — push our fences to Samsara", () => {
  afterEach(() => { delete process.env.SAMSARA_FENCE_PUSH_ENABLED; });
  it("refuses without the flag", async () => {
    await expect(pushFencesToSamsara(db() as never, "c", ["border_crossing"], { findAddressByExternalId: vi.fn(), createAddress: vi.fn() })).rejects.toThrow(/disabled/);
  });
  it("pushes only the named kinds, links an existing ih35Site address instead of duplicating it", async () => {
    process.env.SAMSARA_FENCE_PUSH_ENABLED = "true";
    const d = db();
    const api = { findAddressByExternalId: vi.fn().mockResolvedValueOnce({ id: "sam-existing" }), createAddress: vi.fn() };
    const r = await pushFencesToSamsara(d as never, "c", ["border_crossing"], api);
    expect(r).toMatchObject({ considered: 1, created: 0, linked_existing: 1, failed: 0 });
    expect(api.createAddress).not.toHaveBeenCalled();
    expect(d.updates[0]).toEqual(["f1", "sam-existing"]);
  });
  it("creates with the fence's own centre and radius and ih35Site", async () => {
    process.env.SAMSARA_FENCE_PUSH_ENABLED = "true";
    const api = { findAddressByExternalId: vi.fn().mockResolvedValue(null), createAddress: vi.fn().mockResolvedValue({ id: "sam-new" }) };
    const r = await pushFencesToSamsara(db() as never, "c", ["fuel_stop"], api);
    expect(r.created).toBe(1);
    expect(api.createAddress).toHaveBeenCalledWith(expect.objectContaining({ latitude: 30, longitude: -97, radiusMeters: 200, externalIds: { ih35Site: "f2" } }));
  });
});
