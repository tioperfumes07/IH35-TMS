import { describe, expect, it } from "vitest";
import { formatNaturalCents, naturalCents, naturalCentsForType, naturalSign, normalBalanceOf } from "./naturalBalance";

// U27 — the ledger stores debit − credit; the screen shows the natural sign (QuickBooks).
describe("naturalBalance", () => {
  it("income and liabilities with a credit balance render positive", () => {
    expect(naturalCentsForType(-46_056_072, "Income")).toBe(46_056_072);
    expect(naturalCentsForType(-15_000, "Liability")).toBe(15_000);
    expect(naturalCentsForType(-100, "Equity")).toBe(100);
  });
  it("assets and expenses with a debit balance render positive", () => {
    expect(naturalCentsForType(500, "Expense")).toBe(500);
    expect(naturalCentsForType(500, "CostOfGoodsSold")).toBe(500);
    expect(naturalCentsForType(500, "Asset")).toBe(500);
  });
  it("only a genuinely abnormal balance renders negative", () => {
    expect(naturalCentsForType(5_000, "Liability")).toBe(-5_000); // a liability in debit
    expect(naturalCentsForType(-15_173_634, "Asset")).toBe(-15_173_634); // an asset in credit (1090)
  });
  it("statistical / untyped accounts are shown as stored", () => {
    expect(normalBalanceOf("Statistical")).toBeNull();
    expect(normalBalanceOf(null)).toBeNull();
    expect(naturalCents(-7, null)).toBe(-7);
  });
});

describe("naturalSign (account_type, debit, credit) — ROUND 433", () => {
  it.each([
    ["Asset", 10_000, 0, 10_000],
    ["Expense", 2_500, 0, 2_500],
    ["Liability", 0, 7_000, 7_000],
    ["Liability", 1_000, 0, -1_000],
    ["Equity", 0, 3_000, 3_000],
    ["Income", 0, 500, 500],
    ["Asset", 0, 500, -500],
  ])("%s debit %i credit %i -> %i", (type, d, c, want) => {
    expect(naturalSign(type, d, c)).toBe(want);
  });
  it("missing is null and renders as an em dash", () => {
    expect(naturalSign("Asset", null, null)).toBeNull();
    expect(formatNaturalCents(null, (c) => String(c))).toBe("—");
  });
  it("never prints -0", () => {
    expect(formatNaturalCents(-0, (c) => (Object.is(c, -0) ? "-0" : String(c)))).toBe("0");
  });
});
