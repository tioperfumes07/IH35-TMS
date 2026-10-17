import { describe, expect, it } from "vitest";
import { isExpenseAccount, isPaymentAccount, normalizeSubtype, scopeCostLineAccounts } from "./account-picker-scope";

describe("account-picker-scope", () => {
  describe("normalizeSubtype", () => {
    it("collapses spacing, punctuation and case", () => {
      expect(normalizeSubtype("Cost of Goods Sold")).toBe("costofgoodssold");
      expect(normalizeSubtype("Other Expense")).toBe("otherexpense");
      expect(normalizeSubtype("Credit Card")).toBe("creditcard");
      expect(normalizeSubtype("CashOnHand")).toBe("cashonhand");
    });
  });

  describe("isExpenseAccount", () => {
    it("matches canonical QBO-mirror spellings exactly", () => {
      expect(isExpenseAccount({ account_type: "Expense", is_postable: true, deactivated_at: null })).toBe(true);
      expect(isExpenseAccount({ account_type: "CostOfGoodsSold", is_postable: true, deactivated_at: null })).toBe(true);
      expect(isExpenseAccount({ account_type: "OtherExpense", is_postable: true, deactivated_at: null })).toBe(true);
    });

    it("matches spaced/pretty-printed spellings returned by some endpoints", () => {
      expect(isExpenseAccount({ account_type: "Cost of Goods Sold", is_postable: true, deactivated_at: null })).toBe(true);
      expect(isExpenseAccount({ account_type: "Other Expense", is_postable: true, deactivated_at: null })).toBe(true);
    });

    it("rejects Income, Asset and Liability types", () => {
      expect(isExpenseAccount({ account_type: "Income", is_postable: true, deactivated_at: null })).toBe(false);
      expect(isExpenseAccount({ account_type: "Other Income", is_postable: true, deactivated_at: null })).toBe(false);
      expect(isExpenseAccount({ account_type: "Asset", is_postable: true, deactivated_at: null })).toBe(false);
      expect(isExpenseAccount({ account_type: "Liability", is_postable: true, deactivated_at: null })).toBe(false);
    });

    it("requires postable + active", () => {
      expect(isExpenseAccount({ account_type: "Expense", is_postable: false, deactivated_at: null })).toBe(false);
      expect(isExpenseAccount({ account_type: "Expense", is_postable: true, deactivated_at: "2026-01-01" })).toBe(false);
    });
  });

  describe("isPaymentAccount", () => {
    it("matches Bank and Credit Card types", () => {
      expect(isPaymentAccount({ account_type: "Bank", is_postable: true, deactivated_at: null })).toBe(true);
      expect(isPaymentAccount({ account_type: "Credit Card", is_postable: true, deactivated_at: null })).toBe(true);
      expect(isPaymentAccount({ account_type: "CreditCard", is_postable: true, deactivated_at: null })).toBe(true);
    });

    it("matches cash-like Asset subtypes", () => {
      expect(
        isPaymentAccount({
          account_type: "Asset",
          account_subtype: "Checking",
          is_postable: true,
          deactivated_at: null,
        })
      ).toBe(true);
      expect(
        isPaymentAccount({
          account_type: "Asset",
          account_subtype: "Undeposited Funds",
          is_postable: true,
          deactivated_at: null,
        })
      ).toBe(true);
    });

    it("rejects non-cash Asset subtypes", () => {
      expect(
        isPaymentAccount({
          account_type: "Asset",
          account_subtype: "Accounts Receivable",
          is_postable: true,
          deactivated_at: null,
        })
      ).toBe(false);
    });
  });

  // LEAD RULING 2026-10-17 #1: work-order mode = cost accounts only (ACCT-F92 stands); bill/expense = full chart (443.159).
  describe("scopeCostLineAccounts", () => {
    const chart = [
      { id: "repairs", account_type: "Expense", is_postable: true, deactivated_at: null },
      { id: "parts-cogs", account_type: "CostOfGoodsSold", is_postable: true, deactivated_at: null },
      { id: "other-exp", account_type: "Other Expense", is_postable: true, deactivated_at: null },
      { id: "detention-4210", account_type: "Income", is_postable: true, deactivated_at: null },
      { id: "tonu-4240", account_type: "Income", is_postable: true, deactivated_at: null },
      { id: "misc-other-income", account_type: "OtherIncome", is_postable: true, deactivated_at: null },
      { id: "dispatch-mexico", account_type: "Liability", is_postable: true, deactivated_at: null },
      { id: "inter-co", account_type: "Asset", is_postable: true, deactivated_at: null },
      { id: "expense-header", account_type: "Expense", is_postable: false, deactivated_at: null },
    ];

    it("work-order mode offers cost accounts only — no Income / Other Income, assets, liabilities or headers", () => {
      expect(scopeCostLineAccounts(chart, "wo").map((a) => a.id)).toEqual(["repairs", "parts-cogs", "other-exp"]);
    });

    it("bill mode keeps the full chart (owner 443.159: all accounts, e.g. Dispatch — Mexico)", () => {
      expect(scopeCostLineAccounts(chart, "bill").map((a) => a.id)).toEqual(chart.map((a) => a.id));
    });

    it("expense mode keeps the full chart", () => {
      expect(scopeCostLineAccounts(chart, "expense")).toHaveLength(chart.length);
    });
  });
});
