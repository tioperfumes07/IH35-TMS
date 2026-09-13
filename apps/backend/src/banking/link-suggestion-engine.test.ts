import { describe, expect, it } from "vitest";
import { rankLinkCandidates, scoreLinkCandidate } from "./link-suggestion-engine.js";

describe("link-suggestion-engine", () => {
  it("scores an exact amount/date/vendor hit as high confidence", () => {
    const s = scoreLinkCandidate(
      { amount_cents: 6_294, transaction_date: "2026-09-07", description: "LOVES #0412 LAREDO TX", merchant_name: "LOVES" },
      { obligation_type: "expense", obligation_id: "e1", label: "Expense E-1", amount_cents: 6_294, event_date: "2026-09-07", counterparty_name: "LOVES" }
    );
    expect(s.confidence).toBe("high");
    expect(s.reason).toContain("same amount");
    expect(s.reason).toContain("same day");
    expect(s.reason).toContain("same vendor LOVES");
  });

  it("scores a same-amount-different-vendor-and-date candidate lower, never as high", () => {
    const s = scoreLinkCandidate(
      { amount_cents: 50_000, transaction_date: "2026-09-01", description: "CHECK 1042", merchant_name: null },
      { obligation_type: "bill", obligation_id: "b1", label: "Bill B-1", amount_cents: 50_000, event_date: "2026-08-15", counterparty_name: "ACME REPAIR" }
    );
    expect(s.confidence).not.toBe("high");
    expect(s.reason).toContain("day(s) apart");
  });

  it("names the amount gap in dollars when amounts differ", () => {
    const s = scoreLinkCandidate(
      { amount_cents: 10_000, transaction_date: "2026-09-07", description: "x", merchant_name: null },
      { obligation_type: "expense", obligation_id: "e2", label: "Expense E-2", amount_cents: 10_150, event_date: "2026-09-07" }
    );
    expect(s.reason).toContain("amount off by 1.50");
  });

  it("never returns a candidate with no stated reason", () => {
    const s = scoreLinkCandidate(
      { amount_cents: 100, transaction_date: "2026-01-01", description: null, merchant_name: null },
      { obligation_type: "expense", obligation_id: "e3", label: "Expense E-3", amount_cents: 100, event_date: "2026-01-01" }
    );
    expect(s.reason.length).toBeGreaterThan(0);
  });

  it("rankLinkCandidates sorts by score descending and drops candidates far outside the window", () => {
    const txn = { amount_cents: 20_000, transaction_date: "2026-09-10", description: "LOVES", merchant_name: "LOVES" };
    const candidates = [
      { obligation_type: "expense", obligation_id: "near-exact", label: "Near exact", amount_cents: 20_000, event_date: "2026-09-10", counterparty_name: "LOVES" },
      { obligation_type: "bill", obligation_id: "far-off", label: "Far off", amount_cents: 20_000, event_date: "2026-06-01", counterparty_name: "LOVES" },
      { obligation_type: "expense", obligation_id: "weak", label: "Weak", amount_cents: 5_000, event_date: "2026-09-11", counterparty_name: "OTHER VENDOR" },
    ];
    const ranked = rankLinkCandidates(txn, candidates, 5);
    expect(ranked[0]!.obligation_id).toBe("near-exact");
    expect(ranked.some((r) => r.obligation_id === "far-off")).toBe(false);
  });

  it("rankLinkCandidates respects topN", () => {
    const txn = { amount_cents: 1_000, transaction_date: "2026-09-10", description: null, merchant_name: null };
    const candidates = Array.from({ length: 10 }, (_, i) => ({
      obligation_type: "expense",
      obligation_id: `e${i}`,
      label: `Expense ${i}`,
      amount_cents: 1_000 + i,
      event_date: "2026-09-10",
    }));
    expect(rankLinkCandidates(txn, candidates, 3)).toHaveLength(3);
  });
});
