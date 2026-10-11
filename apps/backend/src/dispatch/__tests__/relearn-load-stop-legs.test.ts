import { describe, expect, it, vi } from "vitest";
import { isModuleOwnedLeg, relearnLoadStopLegs } from "../load-lane-learning.service.js";

// Lead 443.43 #3: after stops are added / resequenced, recompute every non-first leg the module wrote from consecutive stop
// coordinates (engine first, else chain-deadhead haversine); keep owner / document legs and the first-stop deadhead; never
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
    const out = await relearnLoadStopLegs(c, args, blank);
    expect(out.kept_owner_legs).toBe(0);
    expect(out.changed.map((x) => x.stop_id)).toEqual(["s2", "s3"]);
    expect(out.changed.every((x) => x.method === "haversine_chain")).toBe(true);
    expect(out.changed[0]!.new).toBeGreaterThan(140);
    expect(out.changed[1]!.old).toBe(400);
    expect(out.changed[1]!.new).toBeGreaterThan(240);
    expect(out.changed[1]!.new).toBeLessThan(260);
    const sqls = c.query.mock.calls.map((x) => String(x[0]));
    expect(sqls.some((q) => /lane_mileage|customer_lanes/.test(q))).toBe(false);
    expect(sqls.filter((q) => /UPDATE mdata\.load_stops/.test(q)).length).toBe(2);
    const updatedIds = c.query.mock.calls.filter((x) => /UPDATE mdata\.load_stops/.test(String(x[0]))).map((x) => (x[1] as unknown[])[1]);
    expect(updatedIds).toEqual(["s2", "s3"]);
  });
  it("an owner-typed leg is kept", async () => {
    const c = fake({ loaded: "400", stops: [stop("s1", 1, laredo, null), stop("s2", 2, sanAntonio, "150"), stop("s3", 3, dallas, null)] });
    const out = await relearnLoadStopLegs(c, args, blank);
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
    const out = await relearnLoadStopLegs(c, args, blank);
    expect(out.unresolved.map((u) => u.stop_id)).toEqual(["s2", "s3"]);
  });
});
