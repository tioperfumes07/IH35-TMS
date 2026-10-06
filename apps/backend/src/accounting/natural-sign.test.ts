import { describe, expect, it } from "vitest";
import { naturalSignCents, naturalSignFactor, normalSideOfAccountType } from "./natural-sign.js";

describe("naturalSignCents — sign from the ACCOUNT TYPE, never the raw posting (ROUND 433)", () => {
  it.each([
    ["Asset", 10_000, 0, 10_000],
    ["Asset", 0, 10_000, -10_000], // an asset in credit is genuinely abnormal and stays negative
    ["Expense", 2_500, 0, 2_500],
    ["CostOfGoodsSold", 2_500, 500, 2_000],
    ["OtherExpense", 100, 0, 100],
    ["Liability", 0, 7_000, 7_000], // a card owing $70 reads +70, not -70
    ["Liability", 1_000, 0, -1_000], // a liability in debit is abnormal and stays negative
    ["Equity", 0, 3_000, 3_000],
    ["Income", 0, 46_056_072, 46_056_072], // freight income positive, like QuickBooks
    ["OtherIncome", 0, 10, 10],
  ])("%s debit %i credit %i -> %i", (type, d, c, want) => {
    expect(naturalSignCents(type, d, c)).toBe(want);
  });
  it("returns null when nothing is known (renders as an em dash, never 0)", () => {
    expect(naturalSignCents("Asset", null, null)).toBeNull();
  });
  it("a statistical account carries no money sign", () => {
    expect(normalSideOfAccountType("Statistical")).toBeNull();
    expect(naturalSignCents("Statistical", 0, 500)).toBe(-500);
  });
  it("factor follows the ledger function's normal_balance", () => {
    expect(naturalSignFactor("credit")).toBe(-1);
    expect(naturalSignFactor("debit")).toBe(1);
    expect(naturalSignFactor(null)).toBe(1);
  });
});
