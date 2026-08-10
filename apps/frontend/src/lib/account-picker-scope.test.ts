import { describe, expect, it } from "vitest";
import { isExpenseAccount, isPaymentAccount, normalizeSubtype } from "./account-picker-scope";

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
});
