import { describe, expect, it } from "vitest";
import { computeAdjustedBalanceSummary } from "../adjusted-balance-rec.js";

describe("BANK-DOM-03 adjusted-balance recon", () => {
  it("ties to zero with beginning + cleared + DIT + outstanding", () => {
    // Prior ending 10_000. Statement ending 10_500.
    // Cleared: +2000 credit, -1000 debit → book = 10000+2000-1000 = 11000
    // Uncleared: +800 DIT credit, -300 outstanding debit
    // adjusted_bank = 10500 + 800 - 300 = 11000 → variance 0
    const summary = computeAdjustedBalanceSummary({
      beginningBalanceCents: 10_000,
      statementEndingCents: 10_500,
      transactions: [
        { amount_cents: 2000, is_credit: true, reconciliation_cleared: true },
        { amount_cents: 1000, is_credit: false, reconciliation_cleared: true },
        { amount_cents: 800, is_credit: true, reconciliation_cleared: false },
        { amount_cents: 300, is_credit: false, reconciliation_cleared: false },
      ],
    });
    expect(summary.depositsInTransitCents).toBe(800);
    expect(summary.outstandingChecksCents).toBe(300);
    expect(summary.adjustedBankBalanceCents).toBe(11_000);
    expect(summary.adjustedBookBalanceCents).toBe(11_000);
    expect(summary.varianceCents).toBe(0);
  });

  it("surfaces non-zero variance when timing items are ignored (old flat model)", () => {
    const summary = computeAdjustedBalanceSummary({
      beginningBalanceCents: 10_000,
      statementEndingCents: 10_500,
      transactions: [
        { amount_cents: 2000, is_credit: true, reconciliation_cleared: true },
        { amount_cents: 1000, is_credit: false, reconciliation_cleared: true },
        { amount_cents: 800, is_credit: true, reconciliation_cleared: false },
      ],
    });
    // adjusted_bank = 10500+800-0 = 11300; book = 11000; variance 300
    expect(summary.varianceCents).toBe(300);
  });
});
