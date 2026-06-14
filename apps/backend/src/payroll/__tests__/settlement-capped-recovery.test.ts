import { describe, expect, it } from "vitest";
import {
  computeCappedAdvanceRecovery,
  type PendingDeduction,
} from "../settlement-capped-recovery.js";

// A3-2 LOCKED TESTS (non-negotiable). All six must pass.
// Floor convention: floor = max(round(gross*pct/100), minNetCents); these tests pass floorCents directly.

const ded = (id: string, amount: number, remaining: number | null = null, type = "cash_advance_repayment"): PendingDeduction => ({
  id,
  amount_cents: amount,
  remaining_balance_cents: remaining,
  deduction_type: type,
});

describe("A3-2 capped recovery — negative-check-impossible", () => {
  it("a $1,500 advance against $1,000 gross / 50% floor recovers $500 → net $500, never negative", () => {
    const p = computeCappedAdvanceRecovery({ grossCents: 100000, floorCents: 50000, pending: [ded("d1", 150000)] });
    expect(p.totalRecoveredCents).toBe(50000);
    expect(p.netAfterRecoveryCents).toBe(50000);
    expect(p.netAfterRecoveryCents).toBeGreaterThanOrEqual(0);
  });

  it("never goes negative even with an owner below-floor override larger than gross", () => {
    const p = computeCappedAdvanceRecovery({
      grossCents: 80000,
      floorCents: 40000,
      pending: [ded("d1", 999999)],
      targetRecoverCents: 999999,
      allowBelowFloor: true,
    });
    expect(p.totalRecoveredCents).toBe(80000); // capped at gross
    expect(p.netAfterRecoveryCents).toBe(0);
    expect(p.netAfterRecoveryCents).toBeGreaterThanOrEqual(0);
  });
});

describe("A3-2 capped recovery — floor-respected", () => {
  it("net never drops below the floor across many gross/floor/deduction combinations", () => {
    for (const gross of [0, 1, 49999, 50000, 100000, 250000]) {
      for (const floor of [0, 25000, 50000, 300000]) {
        for (const owed of [0, 1, 75000, 500000]) {
          const p = computeCappedAdvanceRecovery({ grossCents: gross, floorCents: floor, pending: [ded("d", owed || 1, owed)] });
          const effectiveFloor = Math.min(floor, gross);
          expect(p.netAfterRecoveryCents).toBeGreaterThanOrEqual(effectiveFloor);
          expect(p.netAfterRecoveryCents).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

describe("A3-2 capped recovery — partial-to-floor-exact", () => {
  it("recovers exactly the room, marks the row partial, carries the precise remainder", () => {
    const p = computeCappedAdvanceRecovery({ grossCents: 100000, floorCents: 50000, pending: [ded("d1", 150000)] });
    const a = p.allocations[0];
    expect(a.recovered_cents).toBe(50000);
    expect(a.new_remaining_cents).toBe(100000); // 150000 - 50000
    expect(a.new_status).toBe("partial");
    expect(a.fully_applied).toBe(false);
  });

  it("fills multiple deductions oldest-first, splitting the last one at the floor", () => {
    const p = computeCappedAdvanceRecovery({
      grossCents: 100000,
      floorCents: 50000, // room = 50000
      pending: [ded("old", 30000), ded("mid", 30000), ded("new", 30000)],
    });
    expect(p.allocations.map((a) => [a.deduction_id, a.recovered_cents])).toEqual([
      ["old", 30000],
      ["mid", 20000], // floor hit mid-way through 'mid'
    ]);
    expect(p.allocations[1].new_remaining_cents).toBe(10000);
    expect(p.allocations[1].new_status).toBe("partial");
    expect(p.deferred.map((d) => d.deduction_id)).toEqual(["new"]); // untouched, carried forward
    expect(p.netAfterRecoveryCents).toBe(50000);
  });
});

describe("A3-2 capped recovery — carry-forward across 3+ periods", () => {
  it("a $1,500 advance recovers 500/500/500 across three $1,000 periods to exactly zero", () => {
    let remaining: number | null = null; // first period: NULL => full amount
    const recovered: number[] = [];
    const statuses: string[] = [];
    for (let period = 0; period < 3; period++) {
      const p = computeCappedAdvanceRecovery({
        grossCents: 100000,
        floorCents: 50000,
        pending: [ded("loan", 150000, remaining)],
      });
      const a = p.allocations[0];
      recovered.push(a.recovered_cents);
      statuses.push(a.new_status);
      remaining = a.new_remaining_cents;
    }
    expect(recovered).toEqual([50000, 50000, 50000]);
    expect(statuses).toEqual(["partial", "partial", "applied"]);
    expect(remaining).toBe(0);
  });
});

describe("A3-2 capped recovery — double-recovery-impossible", () => {
  it("a fully-recovered row (remaining 0) is skipped, not recovered again", () => {
    const p = computeCappedAdvanceRecovery({
      grossCents: 100000,
      floorCents: 0,
      pending: [ded("done", 50000, 0), ded("live", 40000, 40000)],
    });
    expect(p.allocations.map((a) => a.deduction_id)).toEqual(["live"]);
    expect(p.totalRecoveredCents).toBe(40000);
  });
});

describe("A3-2 capped recovery — books-reconcile-to-the-penny", () => {
  it("Σ(remaining after) == Σ(remaining before) − totalRecovered (== the QBO-149 draw-down)", () => {
    const pending = [ded("a", 120000, 120000), ded("b", 80000, 80000), ded("c", 60000, null)];
    const p = computeCappedAdvanceRecovery({ grossCents: 200000, floorCents: 50000, pending });

    const beforeTotal = 120000 + 80000 + 60000;
    const afterTotal =
      p.allocations.reduce((s, a) => s + a.new_remaining_cents, 0) +
      p.deferred.reduce((s, d) => s + d.remaining_cents, 0);

    expect(beforeTotal - afterTotal).toBe(p.totalRecoveredCents); // reconciles to the penny
    expect(p.totalRecoveredCents).toBe(150000); // gross 200000 - floor 50000
    expect(p.netAfterRecoveryCents).toBe(50000);
  });
});
