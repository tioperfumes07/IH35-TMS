import { describe, expect, it } from "vitest";
import {
  BALANCE_SHEET_ACCOUNT_TYPES,
  PROFIT_LOSS_ACCOUNT_TYPES,
  placeAccountType,
  signedPostingAmount,
  signedSectionAmount,
} from "../profit-loss-sections.js";

describe("ACCT-F413 — the P&L's unclassified safety net caught the Balance Sheet", () => {
  it("THE DEFECT: the chart's own asset, liability and equity types are NOT P&L questions", () => {
    // Measured on production 2026-10-03 (ROUND 384's own note): the chart carries eight types.
    // Three of them are Balance Sheet types, and the old three-Set classifier claimed none of them,
    // so each one with activity landed in `unclassified` — a heading that tells the owner his P&L
    // is incomplete. With $415,871.09 of assets and $217,330.49 of liabilities carrying postings,
    // that block was never empty.
    for (const type of ["Asset", "Liability", "Equity"]) {
      expect(placeAccountType(type)).toEqual({ kind: "balance_sheet" });
    }
  });

  it("the five P&L types land in their own sections, with their own sign direction", () => {
    expect(placeAccountType("Income")).toEqual({ kind: "profit_loss", section: "revenue", creditPositive: true });
    expect(placeAccountType("OtherIncome")).toEqual({ kind: "profit_loss", section: "revenue", creditPositive: true });
    expect(placeAccountType("CostOfGoodsSold")).toEqual({ kind: "profit_loss", section: "cogs", creditPositive: false });
    expect(placeAccountType("Expense")).toEqual({ kind: "profit_loss", section: "operating_expenses", creditPositive: false });
    expect(placeAccountType("OtherExpense")).toEqual({ kind: "profit_loss", section: "operating_expenses", creditPositive: false });
  });

  it("Statistical is QuickBooks' non-posting type — not a P&L line and not a question", () => {
    expect(placeAccountType("Statistical")).toEqual({ kind: "balance_sheet" });
  });

  it("QuickBooks' finer balance-sheet type names are claimed too, so a chart import cannot leak them", () => {
    for (const type of [
      "Bank", "AccountsReceivable", "OtherCurrentAsset", "FixedAsset", "OtherAsset",
      "AccountsPayable", "CreditCard", "OtherCurrentLiability", "LongTermLiability",
    ]) {
      expect(placeAccountType(type)).toEqual({ kind: "balance_sheet" });
    }
  });

  it("ONLY a type no statement claims is unclaimed — that is what makes the block worth reading", () => {
    expect(placeAccountType("SomethingNobodyMapped")).toEqual({ kind: "unclaimed" });
    expect(placeAccountType("")).toEqual({ kind: "unclaimed" });
    expect(placeAccountType(null)).toEqual({ kind: "unclaimed" });
    expect(placeAccountType(undefined)).toEqual({ kind: "unclaimed" });
    expect(placeAccountType("  ")).toEqual({ kind: "unclaimed" });
  });

  it("revenue reads credit-positive; cost and expense read debit-positive", () => {
    expect(signedSectionAmount(placeAccountType("Income"), 1_000, 9_000)).toBe(8_000);
    expect(signedSectionAmount(placeAccountType("CostOfGoodsSold"), 9_000, 1_000)).toBe(8_000);
    expect(signedSectionAmount(placeAccountType("Expense"), 9_000, 1_000)).toBe(8_000);
  });

  it("an unclaimed type has no agreed direction, so it reports debit-positive and is labelled", () => {
    expect(signedSectionAmount(placeAccountType("Mystery"), 5_000, 0)).toBe(5_000);
  });

  it("a single posting signs the same way its grouped total does", () => {
    const income = placeAccountType("Income");
    expect(signedPostingAmount(income, "credit", 7_500)).toBe(7_500);
    expect(signedPostingAmount(income, "debit", 7_500)).toBe(-7_500);
    const expense = placeAccountType("Expense");
    expect(signedPostingAmount(expense, "debit", 7_500)).toBe(7_500);
    expect(signedPostingAmount(expense, "credit", 7_500)).toBe(-7_500);
    // Case is not a classification question.
    expect(signedPostingAmount(expense, "DEBIT", 100)).toBe(100);
  });

  it("no type is both a P&L type and a Balance Sheet type", () => {
    const overlap = PROFIT_LOSS_ACCOUNT_TYPES.filter((type) => BALANCE_SHEET_ACCOUNT_TYPES.includes(type));
    expect(overlap).toEqual([]);
  });

  it("the P&L claims exactly five types — a sixth is a decision, not an accident", () => {
    expect([...PROFIT_LOSS_ACCOUNT_TYPES].sort()).toEqual([
      "CostOfGoodsSold", "Expense", "Income", "OtherExpense", "OtherIncome",
    ]);
  });
});
