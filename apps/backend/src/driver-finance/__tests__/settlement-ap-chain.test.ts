import { describe, expect, it } from "vitest";
import { allocateApplication, attributeToLoad, type ApChainLoadBill } from "../settlement-ap-chain.service.js";
import { payLineType } from "../settlement-pay-line.service.js";

const loads: ApChainLoadBill[] = [
  { driverBillId: "b1", loadId: "L1", loadNumber: "13601", grossCents: 100_000, spanStart: "2026-09-01T08:00:00Z", spanEnd: "2026-09-03T18:00:00Z" },
  { driverBillId: "b2", loadId: "L2", loadNumber: "13602", grossCents: 120_000, spanStart: "2026-09-05T08:00:00Z", spanEnd: "2026-09-07T18:00:00Z" },
];

describe("ROUND 326 single settlement poster — owner rules", () => {
  it("a dated item belongs to the load whose dates cover it (owner: reimbursement / extra pay always tie to a load)", () => {
    expect(attributeToLoad(loads, "2026-09-02")?.loadNumber).toBe("13601");
    expect(attributeToLoad(loads, "2026-09-06")?.loadNumber).toBe("13602");
    expect(attributeToLoad(loads, "2026-09-07")?.loadNumber).toBe("13602"); // last day of the load counts
  });

  it("a date between loads goes to the nearest load; no date goes to the first load", () => {
    expect(attributeToLoad(loads, "2026-09-04")?.loadNumber).toBe("13601");
    expect(attributeToLoad(loads, "2026-09-30")?.loadNumber).toBe("13602");
    expect(attributeToLoad(loads, null)?.loadNumber).toBe("13601");
    expect(attributeToLoad([], "2026-09-02")).toBeNull();
  });

  it("an advance is applied to its own load's bill first, then oldest-first (owner: advance = bill payment against that load's bill)", () => {
    const remaining = new Map([["bill-13601", 50_000], ["bill-13602", 80_000]]);
    const parts = allocateApplication(remaining, ["bill-13601", "bill-13602"], 60_000, "bill-13602");
    expect(parts).toEqual([{ key: "bill-13602", cents: 60_000 }]);
    expect(remaining.get("bill-13602")).toBe(20_000);
    const spill = allocateApplication(remaining, ["bill-13601", "bill-13602"], 60_000, "bill-13602");
    expect(spill).toEqual([{ key: "bill-13602", cents: 20_000 }, { key: "bill-13601", cents: 40_000 }]);
  });

  it("applications can never exceed what the load bills owe — refused by name, never plugged", () => {
    const remaining = new Map([["a", 10_000]]);
    expect(() => allocateApplication(remaining, ["a"], 10_001)).toThrow(/exceed/);
  });

  it("a detention line is detention pay; layover / bonus / stop pay / other are extra pay", () => {
    expect(payLineType("detention")).toBe("detention_pay");
    for (const k of ["layover", "bonus", "stop_pay", "other"] as const) expect(payLineType(k)).toBe("extra_pay");
  });
});
