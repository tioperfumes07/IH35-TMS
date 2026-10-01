import { describe, expect, it } from "vitest";
import { computePmCostPerMile, cpmFor, pickAnchor, realDrivenMiles, type OdometerAnchor } from "../pm-cost-per-mile.service.js";

const A = (odo: number, at: string): OdometerAnchor => ({ odometer_mi: odo, read_at: at, source: "vehicle_locations" });

describe("E-15 real driven miles -- odometer only, NULL with a reason, never 0 for missing", () => {
  it("a stale anchor is fine when the truck did not move since (parked: odometer unchanged)", () => {
    expect(pickAnchor("2026-09-01T05:00:00.000Z", A(500000, "2026-08-20T10:00:00.000Z"), 0).anchor?.odometer_mi).toBe(500000);
  });
  it("a stale anchor refuses when the truck moved after it (feed gap Aug 26..Sep 29)", () => {
    const r = pickAnchor("2026-09-01T05:00:00.000Z", A(500000, "2026-08-26T03:05:17.000Z"), 2634);
    expect(r.anchor).toBeNull();
    expect(r.reason).toMatch(/moved \(2634 position fixes.*not measurable/);
  });
  it("a reading within 30 min of the boundary is used while moving (shifted, never lost)", () => {
    expect(pickAnchor("2026-09-01T05:00:00.000Z", A(500000, "2026-09-01T04:45:00.000Z"), 40).anchor).not.toBeNull();
  });
  it("no reading at all refuses", () => {
    expect(pickAnchor("2026-09-01T05:00:00.000Z", null, 0).reason).toMatch(/no odometer reading/);
  });
  it("miles = end anchor minus start anchor; backwards is held", () => {
    expect(realDrivenMiles(A(500000, "x"), A(512345.6, "y"), null, null)).toEqual({ miles: 12345.6, reason: null });
    expect(realDrivenMiles(A(500000, "x"), A(499000, "y"), null, null).miles).toBeNull();
    expect(realDrivenMiles(null, A(1, "y"), "gap", null)).toEqual({ miles: null, reason: "period start: gap" });
  });
});

describe("E-15 CPM -- every figure names its basis, never divides by zero or missing miles", () => {
  it("cost / miles in cents per mile with the basis label", () => {
    expect(cpmFor(150000, 10000, "real_driven", null)).toMatchObject({ basis: "real_driven", cents_per_mile: 15, reason: null });
    expect(cpmFor(150000, 10000, "real_driven", null).basis_label).toMatch(/odometer/);
  });
  it("missing or zero miles is null with a reason", () => {
    expect(cpmFor(150000, null, "real_driven", "feed gap")).toMatchObject({ cents_per_mile: null, reason: "feed gap" });
    expect(cpmFor(150000, 0, "practical", null).cents_per_mile).toBeNull();
  });
});

describe("E-15 engine end to end (mocked db)", () => {
  const OPCO = "00000000-0000-4000-8000-0000000000aa";
  it("real CPM from odometer anchors; practical and short shown beside it; cost from WO -> bills split parts/labor", async () => {
    const client = {
      query: async <T>(sql: string): Promise<{ rows: T[] }> => {
        const r = (x: unknown[]) => ({ rows: x as T[] });
        if (sql.includes("FROM mdata.units u")) return r([{ id: "u1", unit_number: "T174" }]);
        if (sql.includes("WITH b AS")) return r([{ unit_id: "u1", start_ts: "2026-07-01 05:00:00+00", end_ts: "2026-08-01 05:00:00+00",
          sb_odo: "440000", sb_at: "2026-07-01 04:50:00+00", sb_src: "vehicle_locations",
          eb_odo: "450000", eb_at: "2026-08-01 04:55:00+00", eb_src: "vehicle_locations", s_moving: "3", e_moving: "2" }]);
        if (sql.includes("WITH delivered AS")) return r([{ unit_id: "u1", loads: "4", practical: "9500", short: "9200", missing_practical: "0", missing_short: "0" }]);
        if (sql.includes("FROM accounting.bills b")) return r([{ unit_id: "u1", work_order_id: "w1", wo_type: "pm", bill_id: "b1", amount_cents: "60000", parts_cents: "35000", labor_cents: "20000" },
                                                                { unit_id: "u1", work_order_id: "w2", wo_type: "repair", bill_id: "b2", amount_cents: "40000", parts_cents: "0", labor_cents: "40000" }]);
        if (sql.includes("FROM accounting.expenses e")) return r([]);
        return r([]);
      },
    };
    const out = await computePmCostPerMile(client, OPCO, "2026-07-01", "2026-07-31");
    const u = out.units[0];
    expect(u.real_driven_miles).toBe(10000);
    expect(u.pm_cost_cents).toBe(60000);
    expect(u.maintenance_cost_cents).toBe(100000);
    expect(u.cost_breakdown_cents).toEqual({ parts: 35000, labor: 60000, other: 5000, expenses: 0 });
    expect(u.maintenance_cpm.map((c) => [c.basis, c.cents_per_mile])).toEqual([["real_driven", 10], ["practical", 10.53], ["short", 10.87]]);
    expect(u.pm_cpm[0]).toMatchObject({ basis: "real_driven", cents_per_mile: 6 });
    expect(u.work_order_ids.sort()).toEqual(["w1", "w2"]);
    expect(u.bill_ids).toEqual(["b1", "b2"]);
    expect((out.fleet as { real_minus_short_miles: number }).real_minus_short_miles).toBe(800);
  });
});
