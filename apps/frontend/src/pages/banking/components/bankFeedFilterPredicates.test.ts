import { describe, expect, it } from "vitest";
import type { PlaidBankTransaction } from "../../../api/banking";
import { localIsoDate, matchesTransactionTypeFilter } from "./BankingTransactionsDesignView";

// U26 (owner): "banking filters do not filter correctly" — each type filter reads the line's real state.
const line = (patch: Partial<PlaidBankTransaction>): PlaidBankTransaction =>
  ({ id: "t1", amount_cents: -1000, is_credit: false, pending: false, plaid_category: [], description: "X", merchant_name: null, notes: null, review_bucket: "for_review", ...patch }) as PlaidBankTransaction;

describe("bank feed type filters", () => {
  it("Uncategorized is the For review bucket — a categorized deposit / payment / split is NOT uncategorized", () => {
    expect(matchesTransactionTypeFilter("uncategorized", line({}))).toBe(true);
    expect(matchesTransactionTypeFilter("uncategorized", line({ review_bucket: "categorized", resolution_kind: "matched" }))).toBe(false);
    expect(matchesTransactionTypeFilter("uncategorized", line({ review_bucket: "excluded" }))).toBe(false);
  });
  it("Suggested matches are lines still to review that have a suggestion — never lines already matched", () => {
    expect(matchesTransactionTypeFilter("suggested_matches", line({}), { suggestions: { t1: { suggested_match_count: 1 } } })).toBe(true);
    expect(matchesTransactionTypeFilter("suggested_matches", line({}))).toBe(false);
    expect(matchesTransactionTypeFilter("suggested_matches", line({ review_bucket: "categorized", matched_kind: "expense" }), { suggestions: { t1: {} } })).toBe(false);
  });
  it("Transfers are lines recorded as a transfer — not any Plaid category containing 'transfer'", () => {
    expect(matchesTransactionTypeFilter("transfers", line({ resolution_kind: "transfer", review_bucket: "categorized" }))).toBe(true);
    expect(matchesTransactionTypeFilter("transfers", line({ plaid_category: ["Transfer", "Debit"] }))).toBe(false);
  });
  it("Rules are lines a bank rule suggested — not any line with a Plaid category", () => {
    expect(matchesTransactionTypeFilter("rules", line({ suggested_source: "rule:fuel" }))).toBe(true);
    expect(matchesTransactionTypeFilter("rules", line({ plaid_category: ["Gas"] }))).toBe(false);
  });
  it("Missing From/To means no payee saved or suggested", () => {
    expect(matchesTransactionTypeFilter("missing_from_to", line({}))).toBe(true);
    expect(matchesTransactionTypeFilter("missing_from_to", line({ categorization_vendor_id: "v1" }))).toBe(false);
    expect(matchesTransactionTypeFilter("missing_from_to", line({ suggested_vendor_id: "v1" }))).toBe(false);
  });
});

describe("date presets use the viewer's calendar day", () => {
  it("formats the LOCAL date, not the UTC one", () => {
    const evening = new Date(2026, 9, 3, 21, 30); // 9:30 pm local on Oct 3
    expect(localIsoDate(evening)).toBe("2026-10-03");
  });
});
