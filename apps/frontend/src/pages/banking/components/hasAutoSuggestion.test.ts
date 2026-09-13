import { describe, expect, it } from "vitest";
import { hasAutoSuggestion, matchesTransactionTypeFilter } from "./BankingTransactionsDesignView";
import type { PlaidBankTransaction } from "../../../api/banking";

// LINK4-PR3 (owner ask, 2026-09-12) — "money-in excluded from auto-categorization" + the
// AUTO-SUGGESTED filter. Pure-function tests only; no rendering, no network.
function tx(overrides: Partial<PlaidBankTransaction>): PlaidBankTransaction {
  return {
    id: "t1",
    transaction_date: "2026-09-01",
    posted_date: "2026-09-01",
    amount_cents: 10000,
    description: "test",
    merchant_name: null,
    plaid_category: [],
    pending: false,
    is_credit: false,
    matched_load_id: null,
    matched_bill_id: null,
    matched_settlement_id: null,
    notes: null,
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("hasAutoSuggestion", () => {
  it("is true when suggested_vendor_id is set on a pending, non-credit row", () => {
    expect(hasAutoSuggestion(tx({ suggested_vendor_id: "v1" }))).toBe(true);
  });

  it("is true when only suggested_account_id is set (no vendor)", () => {
    expect(hasAutoSuggestion(tx({ suggested_account_id: "a1" }))).toBe(true);
  });

  it("is false with no suggestion at all", () => {
    expect(hasAutoSuggestion(tx({}))).toBe(false);
  });

  it("is false for a money-in (is_credit) row even if a stale suggestion column is set", () => {
    expect(hasAutoSuggestion(tx({ is_credit: true, suggested_vendor_id: "v1" }))).toBe(false);
  });

  it("is false once a human has already categorized the row (categorized_at set)", () => {
    expect(hasAutoSuggestion(tx({ suggested_vendor_id: "v1", categorized_at: "2026-09-02T00:00:00Z" }))).toBe(false);
  });
});

describe('matchesTransactionTypeFilter("auto_suggested", ...)', () => {
  it("matches a row with a pending suggestion", () => {
    expect(matchesTransactionTypeFilter("auto_suggested", tx({ suggested_account_id: "a1" }))).toBe(true);
  });

  it("does not match a row with no suggestion", () => {
    expect(matchesTransactionTypeFilter("auto_suggested", tx({}))).toBe(false);
  });

  it("does not match a money-in row even with a suggestion column set", () => {
    expect(matchesTransactionTypeFilter("auto_suggested", tx({ is_credit: true, suggested_account_id: "a1" }))).toBe(false);
  });
});
