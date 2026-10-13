import { describe, expect, it, vi } from "vitest";
import { chooseLegMiles, computeFirstStopDeadhead, recomputeFirstStopDeadhead } from "../load-lane-learning.service.js";

// Lead 443.41 G(2): first-stop deadhead = miles from the SAME unit's previous load's last stop — the mileage engine first,
// then Google routing (cached in point_mileage as engine 'google'), then the historical lane average (443.53 #2 — never a
// straight line); NULL only when none answers or there is no previous load.

const laredo = { lat: 27.5306, lng: -99.4803 };
const sanAntonio = { lat: 29.4241, lng: -98.4936 };

type Q = { query: ReturnType<typeof vi.fn> };
function chooseClient(opts: { cache?: string; lane?: string }): Q {
  return {
    query: vi.fn(async (sql: string) => {
      if (/SELECT practical_miles::text, shortest_miles::text, engine\s+FROM catalogs\.point_mileage/.test(sql))
        return { rows: opts.cache ? [{ practical_miles: opts.cache, shortest_miles: null, engine: "load_document" }] : [] };
      if (/FROM catalogs\.lane_mileage/.test(sql)) return { rows: opts.lane ? [{ m: opts.lane }] : [] };
      return { rows: [] };
    }),
  };
}
const blankOsrm = { name: "osrm", version: "t", route: vi.fn(async () => ({ practical_miles: null, shortest_miles: null, reason: "osrm_not_configured" })) };
const places = { fromPlace: { city: "Laredo", state: "TX" }, toPlace: { city: "San Antonio", state: "TX" } };
const pick = { operatingCompanyId: "co", from: laredo, to: sanAntonio, ...places };

describe("chooseLegMiles (443.53 #2)", () => {
  it("the point_mileage cache wins; Google is not called", async () => {
    const route = vi.fn();
    expect(await chooseLegMiles(chooseClient({ cache: "157.24" }) as never, pick, blankOsrm, route)).toEqual({ miles: 157.2, method: "point_mileage_cache" });
    expect(route).not.toHaveBeenCalled();
  });
  it("a cache miss asks Google and caches the answer as engine 'google'", async () => {
    const c = chooseClient({});
    const r = await chooseLegMiles(c as never, pick, blankOsrm, vi.fn(async () => ({ miles: 156.8, minutes: 140 })));
    expect(r).toMatchObject({ miles: 156.8, method: "google" });
    const ins = c.query.mock.calls.find((x) => /INSERT INTO catalogs\.point_mileage/.test(String(x[0])));
    expect(String(ins?.[0])).toContain("'google'");
    expect((ins?.[1] as unknown[]).slice(0, 5)).toEqual([27.5306, -99.4803, 29.4241, -98.4936, 156.8]);
  });
  it("no Google route: the historical lane average", async () => {
    expect(await chooseLegMiles(chooseClient({ lane: "154.0" }) as never, pick, blankOsrm, vi.fn(async () => null))).toMatchObject({ miles: 154, method: "lane_average" });
  });
  it("neither: NULL with the reason — never a straight line", async () => {
    const r = await chooseLegMiles(chooseClient({}) as never, pick, blankOsrm, vi.fn(async () => null));
    expect(r).toEqual({ miles: null, reason: "no_google_route_and_no_lane_average:osrm_not_configured" });
  });
  it("no city/state: no lane lookup, NULL", async () => {
    const c = chooseClient({ lane: "154.0" });
    const r = await chooseLegMiles(c as never, { operatingCompanyId: "co", from: laredo, to: sanAntonio }, blankOsrm, vi.fn(async () => null));
    expect(r.miles).toBeNull();
    expect(c.query.mock.calls.some((x) => /lane_mileage/.test(String(x[0])))).toBe(false);
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
    const r = await computeFirstStopDeadhead(c, args, blankProvider, vi.fn(async () => ({ miles: 157.1, minutes: 0 })));
    expect(r).toMatchObject({ method: "google", miles: 157.1, prior_load_id: "L1", prior_load_number: "13500", stop_id: "s1" });
  });
  it("previous load found but no Google route and no lane average: NULL with the reason", async () => {
    const c = fakeClient({
      first: { stop_id: "s1", unit_id: "u1", lat: laredo.lat, lng: laredo.lng, at: "2026-08-10T00:00:00Z", city: "Laredo", state: "TX" },
      prior: { id: "L1", load_number: "13500", lat: sanAntonio.lat, lng: sanAntonio.lng, city: "San Antonio", state: "TX" },
    });
    const r = await computeFirstStopDeadhead(c, args, blankProvider, vi.fn(async () => null));
    expect(r).toMatchObject({ miles: null, reason: "no_google_route_and_no_lane_average:osrm_not_configured", stop_id: "s1" });
  });
});

describe("recomputeFirstStopDeadhead (443.53 #2)", () => {
  const first = { stop_id: "s1", unit_id: "u1", lat: laredo.lat, lng: laredo.lng, at: "2026-08-10T00:00:00Z", city: "Laredo", state: "TX" };
  const prior = { id: "L1", load_number: "13500", lat: sanAntonio.lat, lng: sanAntonio.lng, city: "San Antonio", state: "TX" };
  function client(cur: { leg: string | null; computed: boolean }) {
    return {
      query: vi.fn(async (sql: string) => {
        if (/FROM mdata\.loads l\s+JOIN mdata\.load_stops s/.test(sql)) return { rows: [first] };
        if (/JOIN LATERAL/.test(sql)) return { rows: [prior] };
        if (/AS computed/.test(sql)) return { rows: [cur] };
        return { rows: [], rowCount: 1 };
      }),
    };
  }
  const route = vi.fn(async () => ({ miles: 157.1, minutes: 0 }));
  const a = { operatingCompanyId: "co", loadId: "L2", actorUserId: "u" };
  it("overwrites a computed (straight-line) deadhead with the Google miles", async () => {
    const c = client({ leg: "143.9", computed: true });
    const r = await recomputeFirstStopDeadhead(c as never, a, blankProvider, route);
    expect(r).toMatchObject({ old: 143.9, miles: 157.1, method: "google", written: true });
    expect(c.query.mock.calls.filter((x) => /UPDATE mdata\.load_stops SET leg_miles/.test(String(x[0]))).length).toBe(1);
  });
  it("never overwrites a deadhead the document printed", async () => {
    const c = client({ leg: "120.0", computed: false });
    const r = await recomputeFirstStopDeadhead(c as never, a, blankProvider, route);
    expect(r).toMatchObject({ written: false, reason: "document_deadhead_kept" });
    expect(c.query.mock.calls.some((x) => /UPDATE mdata\.load_stops/.test(String(x[0])))).toBe(false);
  });
  it("fills a NULL first stop", async () => {
    const r = await recomputeFirstStopDeadhead(client({ leg: null, computed: false }) as never, a, blankProvider, route);
    expect(r).toMatchObject({ old: null, miles: 157.1, written: true });
  });
});
