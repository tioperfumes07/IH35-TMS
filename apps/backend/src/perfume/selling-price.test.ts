/**
 * Owner 2026-11-27 15:40 CT: "when generating margins, or calculating, we round to the nearest .25 upwards. .67 is .75 etc."
 * The desk rounding rule closes every calculated selling price; exact cents when the rule is "1". Pure + one DB read of the rule.
 */
import { describe, expect, it } from "vitest";
import { closeBy, sellingPrice } from "./selling-price.js";

const UP25 = { step: "25" as const, dir: "up" as const };
describe("selling price closes by the desk rounding rule", () => {
  it("rounds UP to the next $0.25", () => {
    expect(closeBy(2067, UP25)).toBe(2075); // the owner's example: .67 → .75
    expect(closeBy(2001, UP25)).toBe(2025);
    expect(closeBy(2025, UP25)).toBe(2025); // already on a quarter: unchanged
    expect(closeBy(2076, UP25)).toBe(2100);
  });
  it("prices from cost at the margin, then closes", () => {
    // $10.00 at 12.5 % margin = $11.4286 → $11.43 exact → $11.50 closed up to the quarter.
    expect(sellingPrice(1000, 12.5, "margin", { step: "1", dir: "up" })).toBe(1143);
    expect(sellingPrice(1000, 12.5, "margin", UP25)).toBe(1150);
    // markup 11 %: $18.60 → $20.646 → $20.65 → $20.75
    expect(sellingPrice(1860, 11, "markup", UP25)).toBe(2075);
  });
});
