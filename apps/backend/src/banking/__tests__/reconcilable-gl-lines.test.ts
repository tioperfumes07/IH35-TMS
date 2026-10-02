/**
 * B-2 — foldGlLinesIntoSummary must not disturb bank match-fallback math.
 */
import { describe, expect, it } from "vitest";
import { foldGlLinesIntoSummary, type ReconcilableGlLine } from "../reconcilable-gl-lines.js";

const emptyBank = {
  beginningBalanceCents: 10_000,
  statementEndingCents: 10_000,
  clearedCreditsCents: 5_000,
  clearedDebitsCents: 2_000,
  depositsInTransitCents: 100,
  outstandingChecksCents: 50,
  adjustedBankBalanceCents: 10_050,
  adjustedBookBalanceCents: 13_000,
  varianceCents: -2_950,
  bookBalanceCents: 13_000,
  matchedCreditsCents: 5_000,
  matchedDebitsCents: 2_000,
};

function line(partial: Partial<ReconcilableGlLine> & Pick<ReconcilableGlLine, "amount_cents" | "is_credit" | "register_cleared">): ReconcilableGlLine {
  return {
    posting_id: "p1",
    journal_entry_id: "j1",
    entry_date: "2026-09-01",
    memo: null,
    description: null,
    type_label: "Journal",
    source_transaction_type: null,
    ref: null,
    payee: null,
    split_account: null,
    ...partial,
  };
}

describe("foldGlLinesIntoSummary", () => {
  it("adds cleared JE deposits/payments into cleared totals and recomputes variance", () => {
    const folded = foldGlLinesIntoSummary(emptyBank, [
      line({ amount_cents: 300, is_credit: true, register_cleared: true }),
      line({ amount_cents: 100, is_credit: false, register_cleared: true }),
    ]);
    expect(folded.clearedCreditsCents).toBe(5_300);
    expect(folded.clearedDebitsCents).toBe(2_100);
    expect(folded.depositsInTransitCents).toBe(100);
    expect(folded.outstandingChecksCents).toBe(50);
    expect(folded.adjustedBookBalanceCents).toBe(10_000 + 5_300 - 2_100);
    expect(folded.adjustedBankBalanceCents).toBe(10_000 + 100 - 50);
    expect(folded.varianceCents).toBe(folded.adjustedBankBalanceCents - folded.adjustedBookBalanceCents);
  });

  it("uncleared JE lines land in in-transit / outstanding, not cleared", () => {
    const folded = foldGlLinesIntoSummary(emptyBank, [
      line({ amount_cents: 400, is_credit: true, register_cleared: false }),
      line({ amount_cents: 250, is_credit: false, register_cleared: false }),
    ]);
    expect(folded.clearedCreditsCents).toBe(5_000);
    expect(folded.clearedDebitsCents).toBe(2_000);
    expect(folded.depositsInTransitCents).toBe(500);
    expect(folded.outstandingChecksCents).toBe(300);
  });
});
