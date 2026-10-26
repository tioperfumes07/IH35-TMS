import { describe, expect, it } from "vitest";
import {
  categorizedWhoWhenText,
  hasAutoSuggestion,
  matchesTransactionTypeFilter,
  categorizationConfidenceLabel,
  suggestionSourceLabel,
} from "./BankingTransactionsDesignView";
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

describe("443.343-C suggestion labels", () => {
  it("maps rule / history / payee / document sources", () => {
    expect(suggestionSourceLabel("banking_rule:abc")).toBe("Rule");
    expect(suggestionSourceLabel("catch_all_rule")).toBe("Rule");
    expect(suggestionSourceLabel("accepted_history")).toBe("History");
    expect(suggestionSourceLabel("description_payee:zelle_to")).toBe("Payee");
    expect(suggestionSourceLabel("fuzzy_vendor_match:x")).toBe("Payee");
    expect(suggestionSourceLabel("relay_fill_load_driver")).toBe("Document");
    expect(suggestionSourceLabel(null)).toBeNull();
  });

  it("maps confidence to High / Medium / Low", () => {
    expect(categorizationConfidenceLabel("high")).toBe("High");
    expect(categorizationConfidenceLabel("medium")).toBe("Medium");
    expect(categorizationConfidenceLabel("low")).toBe("Low");
    expect(categorizationConfidenceLabel(null)).toBeNull();
  });

  it("formats who+when on accepted lines", () => {
    expect(
      categorizedWhoWhenText(
        tx({ categorized_at: "2026-10-24T15:00:00Z", categorized_by_user_name: "Jorge Munoz" }),
      ),
    ).toMatch(/^Accepted by Jorge Munoz · /);
    expect(categorizedWhoWhenText(tx({ categorized_at: "2026-10-24T15:00:00Z" }))).toMatch(/^Accepted · /);
    expect(categorizedWhoWhenText(tx({}))).toBeNull();
  });
});
