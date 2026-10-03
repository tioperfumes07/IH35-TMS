import { describe, expect, it } from "vitest";
import { naturalCents, naturalCentsForType, normalBalanceOf } from "./naturalBalance";

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
