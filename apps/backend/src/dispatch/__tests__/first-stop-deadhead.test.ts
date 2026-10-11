import { describe, expect, it, vi } from "vitest";
import { chooseDeadheadMiles, computeFirstStopDeadhead } from "../load-lane-learning.service.js";

// Lead 443.41 G(2): first-stop deadhead = miles from the SAME unit's previous load's last stop — the mileage engine first,
// the owner-ruled chain-deadhead haversine only when the engine has no answer; NULL only when there is no previous load.

const laredo = { lat: 27.5306, lng: -99.4803 };
const sanAntonio = { lat: 29.4241, lng: -98.4936 };

describe("chooseDeadheadMiles", () => {
  it("the engine's cached miles win", () => {
    expect(chooseDeadheadMiles({ practical_miles: 157.24, source: "cache" }, laredo, sanAntonio)).toEqual({ miles: 157.2, method: "point_mileage_cache" });
  });
  it("a routing provider answer is labelled as such", () => {
    expect(chooseDeadheadMiles({ practical_miles: 158, source: "provider" }, laredo, sanAntonio)).toMatchObject({ method: "routing_provider", miles: 158 });
  });
  it("no engine answer: chain-deadhead haversine, with the engine's reason kept", () => {
    const r = chooseDeadheadMiles({ practical_miles: null, source: "blank", reason: "osrm_not_configured" }, laredo, sanAntonio);
    expect(r.method).toBe("haversine_chain");
    expect(r.engine_reason).toBe("osrm_not_configured");
    expect(r.miles).toBeGreaterThan(140);
    expect(r.miles).toBeLessThan(150);
  });
});

function fakeClient(rows: { first?: unknown; prior?: unknown }) {
  return {
    query: vi.fn(async (sql: string) => {
      if (/FROM mdata\.loads l\s+JOIN mdata\.load_stops s/.test(sql)) return { rows: rows.first ? [rows.first] : [] };
      if (/JOIN LATERAL/.test(sql)) return { rows: rows.prior ? [rows.prior] : [] };
      if (/FROM catalogs\.point_mileage/.test(sql)) return { rows: [] };
      return { rows: [] };
    }),
  };
}
const blankProvider = { name: "osrm", version: "t", route: vi.fn(async () => ({ practical_miles: null, shortest_miles: null, reason: "osrm_not_configured" })) };
const args = { operatingCompanyId: "co", loadId: "L2" };

describe("computeFirstStopDeadhead", () => {
  it("NULL with a reason when the unit has no previous load — never 0", async () => {
    const c = fakeClient({ first: { stop_id: "s1", unit_id: "u1", lat: laredo.lat, lng: laredo.lng, at: "2026-08-10T00:00:00Z" } });
    expect(await computeFirstStopDeadhead(c, args, blankProvider)).toMatchObject({ miles: null, reason: "no_previous_load_for_unit" });
  });
  it("NULL when the load has no unit", async () => {
    const c = fakeClient({ first: { stop_id: "s1", unit_id: null, lat: 1, lng: 1, at: "2026-08-10T00:00:00Z" } });
    expect(await computeFirstStopDeadhead(c, args, blankProvider)).toMatchObject({ miles: null, reason: "load_has_no_unit" });
  });
  it("previous load found: miles from its last stop to this first stop, prior load named", async () => {
    const c = fakeClient({
      first: { stop_id: "s1", unit_id: "u1", lat: laredo.lat, lng: laredo.lng, at: "2026-08-10T00:00:00Z" },
      prior: { id: "L1", load_number: "13500", lat: sanAntonio.lat, lng: sanAntonio.lng },
    });
    const r = await computeFirstStopDeadhead(c, args, blankProvider);
    expect(r).toMatchObject({ method: "haversine_chain", prior_load_id: "L1", prior_load_number: "13500", stop_id: "s1" });
    expect(r.miles).toBeGreaterThan(140);
  });
});
