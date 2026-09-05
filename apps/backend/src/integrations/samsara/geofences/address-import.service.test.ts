import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
vi.mock("../../../auth/db.js", () => ({
  withLuciaBypass: (callback: (client: { query: typeof query }) => unknown) => callback({ query }),
}));

import { importSamsaraAddresses, projectSamsaraAddress } from "./address-import.service.js";

describe("Samsara address projection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    query.mockReset();
    query.mockResolvedValue({ rows: [] });
  });

  it("preserves polygons exactly", () => {
    const raw = { name: "Dock", geofence: { polygon: { vertices: [
      { latitude: 27.1, longitude: -99.1 }, { latitude: 27.2, longitude: -99.2 }, { latitude: 27.3, longitude: -99.1 },
    ] } } };
    const row = projectSamsaraAddress({ id: "addr-1", raw });
    expect(row.vertices).toEqual([{ lat: 27.1, lng: -99.1 }, { lat: 27.2, lng: -99.2 }, { lat: 27.3, lng: -99.1 }]);
    expect(row.geofenceJson).toBe(raw.geofence);
  });

  it("turns a circle into 16 vertices while retaining center and radius", () => {
    const row = projectSamsaraAddress({ id: "addr-2", raw: {
      name: "Yard", geofence: { circle: { latitude: 27.5, longitude: -99.5, radiusMeters: 402 } },
    } });
    expect(row.vertices).toHaveLength(16);
    expect(row.latitude).toBe(27.5);
    expect(row.longitude).toBe(-99.5);
    expect(row.radiusMeters).toBe(402);
  });

  it("does not create geometry around an unresolved point", () => {
    const row = projectSamsaraAddress({ id: "addr-3", raw: { name: "Unknown", geofence: {} } });
    expect(row.vertices).toBeNull();
    expect(row.latitude).toBeNull();
    expect(row.longitude).toBeNull();
  });

  it("is a zero-write dry-run by default", async () => {
    const result = await importSamsaraAddresses({
      operatingCompanyId: "5c854333-6ea5-4faa-af31-67cb272fef80",
      addresses: [{ id: "addr-4", raw: { geofence: {} } }],
    });
    expect(result).toMatchObject({ mode: "dry-run", addresses_read: 1, writes: 0, unresolved_geofences: 1 });
    expect(query).toHaveBeenCalledTimes(1); // unresolved geometry cannot be proximity-matched
    expect(query.mock.calls[0]?.[0]).toContain("set_config");
  });

  it("matches only when normalized name and proximity produce one candidate", async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: "location-1", location_type: "yard" }] });
    const result = await importSamsaraAddresses({
      operatingCompanyId: "5c854333-6ea5-4faa-af31-67cb272fef80",
      addresses: [{ id: "addr-5", raw: {
        name: "IH35 Yard", geofence: { circle: { latitude: 27.5, longitude: -99.5, radiusMeters: 402 } },
      } }],
    });
    expect(result).toMatchObject({ matched_existing_locations: 1, ambiguous_matches: 0, writes: 0 });
    expect(query.mock.calls[1]?.[0]).toContain("regexp_replace(lower(location_name)");
    expect(query.mock.calls[1]?.[0]).toContain("<= 805");
  });

  it("reports ambiguous candidates instead of merging one", async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [
      { id: "location-1", location_type: "yard" }, { id: "location-2", location_type: "yard" },
    ] });
    const result = await importSamsaraAddresses({
      operatingCompanyId: "5c854333-6ea5-4faa-af31-67cb272fef80",
      addresses: [{ id: "addr-6", raw: {
        name: "IH35 Yard", geofence: { circle: { latitude: 27.5, longitude: -99.5, radiusMeters: 402 } },
      } }],
    });
    expect(result.collisions).toEqual([{ samsara_address_id: "addr-6", candidate_location_ids: ["location-1", "location-2"] }]);
  });

  it("fails closed when apply is requested before the state table exists", async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ relation: null }] });
    await expect(importSamsaraAddresses({
      operatingCompanyId: "5c854333-6ea5-4faa-af31-67cb272fef80",
      apply: true,
      addresses: [],
    })).rejects.toThrow("geo.geofence_vehicle_state_missing");
  });
});
