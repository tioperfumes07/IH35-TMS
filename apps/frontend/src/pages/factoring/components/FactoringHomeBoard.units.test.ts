import { describe, expect, it } from "vitest";
import { fmtMoneyDollars, trueCostPercent } from "./FactoringHomeBoard";

// Register row 98 — Factoring Home KPIs printed raw NUMERIC text and True cost read 0.00% while fees were $2,634.76.
describe("Factoring Home KPI units (row 98)", () => {
  it("formats NUMERIC text from the API as dollars, never raw digits", () => {
    expect(fmtMoneyDollars("175650.000000000000")).toBe("$175,650.00");
    expect(fmtMoneyDollars("170210.480000000000")).toBe("$170,210.48");
    expect(fmtMoneyDollars(12.5)).toBe("$12.50");
  });
  it("is honest when there is no number", () => {
    expect(fmtMoneyDollars(null)).toBe("—");
    expect(fmtMoneyDollars("")).toBe("—");
    expect(fmtMoneyDollars("abc")).toBe("—");
  });
  it("True cost = (fees + wire fees) / gross purchased, same purchases", () => {
    expect(trueCostPercent(263476, 0, 17565000)).toBeCloseTo(1.5, 2);
    expect(trueCostPercent(150000, 1000, 10000000)).toBeCloseTo(1.51, 2);
    expect(trueCostPercent(0, 0, 0)).toBeNull();
  });
});
