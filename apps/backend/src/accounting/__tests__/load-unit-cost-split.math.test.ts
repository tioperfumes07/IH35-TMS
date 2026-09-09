import { describe, expect, it } from "vitest";
import { splitCostByMiles, sharesReconcile, type UnitMiles } from "../load-unit-cost-split.math.js";
import { computeTimeWindowMiles } from "../load-unit-cost-split.routes.js";

const u = (id: string, num: string | null, miles: number): UnitMiles => ({ unit_id: id, unit_number: num, miles });

describe("splitCostByMiles (SET-28 miles-weighted cost split)", () => {
  it("single truck takes 100% of the pool", () => {
    const shares = splitCostByMiles(123456, [u("a", "T169", 812)]);
    expect(shares).toHaveLength(1);
    expect(shares[0].allocated_cost_cents).toBe(123456);
    expect(shares[0].miles_pct).toBe(100);
    expect(sharesReconcile(123456, shares)).toBe(true);
  });

  it("splits by miles and reconciles exactly to the penny", () => {
    // 600 mi + 400 mi over $1,000.03 pool -> 60% / 40%, penny lands deterministically.
    const pool = 100003;
    const shares = splitCostByMiles(pool, [u("a", "T169", 600), u("b", "T177", 400)]);
    const total = shares.reduce((s, x) => s + x.allocated_cost_cents, 0);
    expect(total).toBe(pool);
    expect(sharesReconcile(pool, shares)).toBe(true);
    // 60% of 100003 = 60001.8 -> floor 60001 (+1 penny from largest remainder .8) = 60002
    // 40% of 100003 = 40001.2 -> floor 40001 (.2) = 40001
    expect(shares[0].allocated_cost_cents).toBe(60002);
    expect(shares[1].allocated_cost_cents).toBe(40001);
    expect(shares[0].miles_pct).toBe(60);
    expect(shares[1].miles_pct).toBe(40);
  });

  it("distributes leftover pennies deterministically by fractional remainder, then by miles", () => {
    // three-way split of 100 cents across equal-ish miles that force a 1-penny remainder
    const pool = 100;
    const shares = splitCostByMiles(pool, [u("a", "A", 1), u("b", "B", 1), u("c", "C", 1)]);
    expect(shares.reduce((s, x) => s + x.allocated_cost_cents, 0)).toBe(pool);
    // 33.33 each -> floors 33,33,33 = 99, one leftover penny -> first unit (tie -> order)
    expect(shares.map((s) => s.allocated_cost_cents)).toEqual([34, 33, 33]);
  });

  it("falls back to an equal split when no truck has miles, still reconciling", () => {
    const pool = 999;
    const shares = splitCostByMiles(pool, [u("a", "A", 0), u("b", "B", 0)]);
    expect(shares.reduce((s, x) => s + x.allocated_cost_cents, 0)).toBe(pool);
    expect(shares[0].allocated_cost_cents + shares[1].allocated_cost_cents).toBe(pool);
  });

  it("never invents or loses a penny across a fuzz of random inputs", () => {
    for (let t = 0; t < 500; t++) {
      const pool = Math.floor(Math.random() * 5_000_000);
      const nUnits = 1 + Math.floor(Math.random() * 5);
      const units = Array.from({ length: nUnits }, (_, i) => u(`u${i}`, `T${i}`, Math.floor(Math.random() * 2000)));
      const shares = splitCostByMiles(pool, units);
      expect(shares.reduce((s, x) => s + x.allocated_cost_cents, 0)).toBe(pool);
      expect(shares.every((s) => s.allocated_cost_cents >= 0)).toBe(true);
    }
  });
});

describe("computeTimeWindowMiles (SET-28 fallback basis)", () => {
  it("single unit gets all practical miles", () => {
    const m = computeTimeWindowMiles([{ unit_id: "a", first_at: null }], "2026-09-08T12:00:00Z", 900);
    expect(m.get("a")).toBe(900);
  });

  it("apportions practical miles by the duration each truck was assigned", () => {
    // truck A assigned at 00:00, truck B at 06:00, load ends 12:00 -> A ran 6h, B ran 6h -> 50/50
    const m = computeTimeWindowMiles(
      [
        { unit_id: "a", first_at: "2026-09-08T00:00:00Z" },
        { unit_id: "b", first_at: "2026-09-08T06:00:00Z" },
      ],
      "2026-09-08T12:00:00Z",
      1000
    );
    expect(m.get("a")).toBeCloseTo(500, 5);
    expect(m.get("b")).toBeCloseTo(500, 5);
  });

  it("apportions unequally by window length", () => {
    // A 00:00->03:00 (3h), B 03:00->12:00 (9h) -> 25% / 75%
    const m = computeTimeWindowMiles(
      [
        { unit_id: "a", first_at: "2026-09-08T00:00:00Z" },
        { unit_id: "b", first_at: "2026-09-08T03:00:00Z" },
      ],
      "2026-09-08T12:00:00Z",
      1200
    );
    expect(m.get("a")).toBeCloseTo(300, 5);
    expect(m.get("b")).toBeCloseTo(900, 5);
  });

  it("returns nothing when there are no practical miles", () => {
    const m = computeTimeWindowMiles([{ unit_id: "a", first_at: null }], "2026-09-08T12:00:00Z", 0);
    expect(m.size).toBe(0);
  });
});
