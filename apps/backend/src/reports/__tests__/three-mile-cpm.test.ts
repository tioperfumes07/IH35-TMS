import { describe, expect, it } from "vitest";
import { basisFigure, groupLoads, groupRow, mpgFigure, type ThreeMileLoad } from "../three-mile-cpm.service.js";

const L = (o: Partial<ThreeMileLoad> & { id: string }): ThreeMileLoad => ({
  load_id: o.id, load_number: o.id, unit_id: o.unit_id ?? "u1", unit_number: o.unit_number ?? "T1", driver_id: o.driver_id ?? "d1", driver_name: "D", lane: o.lane ?? "LAREDO, TX → DALLAS, TX",
  delivered_at: "2026-07-02", direct_cost_cents: o.direct_cost_cents ?? 0, diesel_gallons: o.diesel_gallons ?? null,
  miles: { real_driven: null, practical: null, short: null, ...(o.miles ?? {}) },
  miles_reason: { real_driven: "manual entry", practical: null, short: null, ...(o.miles_reason ?? {}) },
});

describe("three-mile CPM -- every figure names its basis; cost only of loads that have the basis", () => {
  it("a basis divides the cost of ONLY its own loads by their miles", () => {
    const loads = [L({ id: "a", direct_cost_cents: 100_000, miles: { practical: 500, real_driven: 550 } }), L({ id: "b", direct_cost_cents: 900_000, miles: { practical: 1000 } })];
    const real = basisFigure(loads, "real_driven");
    expect(real).toMatchObject({ basis: "real_driven", miles: 550, cost_cents: 100_000, loads_included: 1, loads_excluded: 1 });
    expect(real.cents_per_mile).toBeCloseTo(181.82, 2);
    expect(basisFigure(loads, "practical")).toMatchObject({ miles: 1500, cost_cents: 1_000_000, cents_per_mile: 666.67 });
    expect(real.basis_label).toMatch(/odometer/);
  });
  it("no load with the basis -> CPM null with a reason, never 0", () => {
    const f = basisFigure([L({ id: "a", direct_cost_cents: 5, miles: { practical: 10 } })], "real_driven");
    expect(f).toMatchObject({ cents_per_mile: null, miles: null, loads_included: 0 });
    expect(f.reason).toMatch(/manual entry/);
  });
  it("MPG uses only loads with both miles and diesel gallons", () => {
    const m = mpgFigure([L({ id: "a", diesel_gallons: 100, miles: { practical: 540 } }), L({ id: "b", miles: { practical: 999 } })], "practical");
    expect(m).toMatchObject({ miles: 540, gallons: 100, mpg: 5.4 });
    expect(mpgFigure([L({ id: "a", miles: { practical: 1 } })], "real_driven").mpg).toBeNull();
  });
  it("driven-but-unbilled miles only over loads with both bases", () => {
    const row = groupRow("fleet", "f", "Fleet", null, [L({ id: "a", miles: { practical: 500, real_driven: 530 } }), L({ id: "b", miles: { practical: 900 } })]);
    expect(row.real_minus_practical_miles).toBe(30);
    expect(row.real_minus_short_miles).toBeNull();
  });
  it("groups by unit / driver / lane / load", () => {
    const loads = [L({ id: "a", unit_id: "u1", unit_number: "T1" }), L({ id: "b", unit_id: "u2", unit_number: "T2", lane: "A → B" }), L({ id: "c", unit_id: "u1", unit_number: "T1" })];
    expect(groupLoads(loads, "unit").map((r) => [r.label, r.loads])).toEqual([["T1", 2], ["T2", 1]]);
    expect(groupLoads(loads, "lane").map((r) => r.label)).toEqual(["A → B", "LAREDO, TX → DALLAS, TX"]);
    expect(groupLoads(loads, "load")).toHaveLength(3);
  });
});
