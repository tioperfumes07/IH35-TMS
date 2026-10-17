import { describe, expect, it, vi } from "vitest";
import { isModuleOwnedLeg, relearnLoadStopLegs } from "../load-lane-learning.service.js";

// Lead 443.43 #3: after stops are added / resequenced, recompute every non-first leg the module wrote from consecutive stop
// coordinates (engine first, then Google routing, then the lane average — 443.53 #2: never a straight line); keep owner / document legs and the first-stop deadhead; never
// touch lane_mileage / customer_lanes.

const laredo = { latitude: 27.5306, longitude: -99.4803 };
const sanAntonio = { latitude: 29.4241, longitude: -98.4936 };
const dallas = { latitude: 32.7767, longitude: -96.797 };

function fake(opts: { stops: Array<Record<string, unknown>>; loaded: string | null; audited?: string[] }) {
  const query = vi.fn(async (sql: string, _v?: unknown[]) => {
    if (/FROM mdata\.loads WHERE id/.test(sql)) return { rows: [{ loaded_miles: opts.loaded, miles_shortest: null, miles_practical: null }] };
    if (/FROM mdata\.load_stops/.test(sql)) return { rows: opts.stops };
    if (/FROM audit\.audit_events/.test(sql)) return { rows: (opts.audited ?? []).map((stop_id) => ({ stop_id })) };
    if (/FROM catalogs\.point_mileage/.test(sql)) return { rows: [] };
    return { rows: [], rowCount: 1 };
  });
  return { query };
}
const blank = { name: "osrm", version: "t", route: vi.fn(async () => ({ practical_miles: null, shortest_miles: null, reason: "osrm_not_configured" })) };
const args = { operatingCompanyId: "co", loadId: "L1", actorUserId: "u" };
// Google driving distance by destination latitude (San Antonio leg 157.2, Dallas leg 274.6).
const google = vi.fn(async (_f: { lat: number; lng: number }, t: { lat: number; lng: number }) => ({ miles: t.lat > 30 ? 274.6 : 157.2, minutes: 0 }));
const stop = (id: string, seq: number, at: typeof laredo, leg: string | null) => ({ id, sequence_number: seq, stop_type: seq === 1 ? "pickup" : "delivery", city: "x", state: "TX", postal_code: null, ...at, leg_miles: leg, at: null });

describe("isModuleOwnedLeg", () => {
  it("NULL, audited, or the module's own rule value is module-owned", () => {
    expect(isModuleOwnedLeg(null, { audited: false, loadedMiles: 400, pairMiles: null })).toBe(true);
    expect(isModuleOwnedLeg(123, { audited: true, loadedMiles: 400, pairMiles: null })).toBe(true);
    expect(isModuleOwnedLeg(400, { audited: false, loadedMiles: 400, pairMiles: null })).toBe(true);
    expect(isModuleOwnedLeg(77, { audited: false, loadedMiles: 400, pairMiles: 77 })).toBe(true);
  });
  it("any other value was typed by a document / the owner and is kept", () => {
    expect(isModuleOwnedLeg(250, { audited: false, loadedMiles: 400, pairMiles: null })).toBe(false);
  });
});

describe("relearnLoadStopLegs", () => {
  it("2 -> 3 stops: the old whole-load delivery leg and the new middle leg are recomputed; first stop untouched; no lane writes", async () => {
    const c = fake({
      loaded: "400",
      stops: [stop("s1", 1, laredo, "12.0"), stop("s2", 2, sanAntonio, null), stop("s3", 3, dallas, "400")],
    });
    const out = await relearnLoadStopLegs(c, args, blank, google);
    expect(out.kept_owner_legs).toBe(0);
    expect(out.changed.map((x) => x.stop_id)).toEqual(["s2", "s3"]);
    expect(out.changed.every((x) => x.method === "google")).toBe(true);
    expect(out.changed[0]!.new).toBe(157.2);
    expect(out.changed[1]!.old).toBe(400);
    expect(out.changed[1]!.new).toBe(274.6);
    const sqls = c.query.mock.calls.map((x) => String(x[0]));
    expect(sqls.some((q) => /lane_mileage|customer_lanes/.test(q))).toBe(false);
    expect(sqls.filter((q) => /INSERT INTO catalogs\.point_mileage[\s\S]*'google'/.test(q)).length).toBe(2);
    expect(sqls.filter((q) => /UPDATE mdata\.load_stops/.test(q)).length).toBe(2);
    const updatedIds = c.query.mock.calls.filter((x) => /UPDATE mdata\.load_stops/.test(String(x[0]))).map((x) => (x[1] as unknown[])[1]);
    expect(updatedIds).toEqual(["s2", "s3"]);
  });
  it("an owner-typed leg is kept", async () => {
    const c = fake({ loaded: "400", stops: [stop("s1", 1, laredo, null), stop("s2", 2, sanAntonio, "150"), stop("s3", 3, dallas, null)] });
    const out = await relearnLoadStopLegs(c, args, blank, google);
    expect(out.kept_owner_legs).toBe(1);
    expect(out.changed.map((x) => x.stop_id)).toEqual(["s3"]);
  });
  it("a 2-stop load keeps the module rule: delivery leg = the load's loaded miles", async () => {
    const c = fake({ loaded: "400", stops: [stop("s1", 1, laredo, null), stop("s2", 2, dallas, null)] });
    const out = await relearnLoadStopLegs(c, args, blank);
    expect(out.changed).toEqual([{ stop_id: "s2", old: null, new: 400, method: "load_loaded_miles" }]);
  });
  it("a stop with no coordinates is listed, never invented", async () => {
    const c = fake({ loaded: "400", stops: [stop("s1", 1, laredo, null), { ...stop("s2", 2, sanAntonio, null), latitude: null }, stop("s3", 3, dallas, null)] });
    const out = await relearnLoadStopLegs(c, args, blank, google);
    expect(out.unresolved.map((u) => u.stop_id)).toEqual(["s2", "s3"]);
  });
  it("no Google route and no lane average: listed with the reason, never a straight line, never written", async () => {
    const c = fake({ loaded: "400", stops: [stop("s1", 1, laredo, null), stop("s2", 2, sanAntonio, null), stop("s3", 3, dallas, null)] });
    const out = await relearnLoadStopLegs(c, args, blank, vi.fn(async () => null));
    expect(out.changed).toEqual([]);
    expect(out.unresolved.map((u) => u.reason)).toEqual(["no_google_route_and_no_lane_average:osrm_not_configured;google_routes_no_route", "no_google_route_and_no_lane_average:osrm_not_configured;google_routes_no_route"]); // 443.192: the Google miss is named
    expect(c.query.mock.calls.some((x) => /UPDATE mdata\.load_stops/.test(String(x[0])))).toBe(false);
  });
});
