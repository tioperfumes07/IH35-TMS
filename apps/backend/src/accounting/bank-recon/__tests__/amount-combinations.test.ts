import { describe, expect, it } from "vitest";
import { findAmountCombinations, type ComboCandidate } from "../amount-combinations.js";

// LEAD 443.304 — owner cases 10-24: one wire = 2 Faro purchases the same day; a purchase + a loan of the same amount;
// near sums go to Resolve difference; nothing auto-matches.
const c = (kind: string, id: string, dollars: number, gap = 0, who: string | null = null): ComboCandidate =>
  ({ ledger_entry_kind: kind, ledger_entry_id: id, amount_cents: Math.round(dollars * 100), date_gap_days: gap, counterparty_name: who, reference: id });
const opts = { exactToleranceCents: 100, nearPct: 0.02 };

describe("findAmountCombinations (443.304)", () => {
  it("one $20,000.00 wire = two Faro purchases the same day", () => {
    const pool = [c("factoring_advance", "P-1", 12_500, 0, "Faro"), c("factoring_advance", "P-2", 7_500, 0, "Faro"), c("payment", "PAY-9", 3_100, 2, "Acme")];
    const r = findAmountCombinations(2_000_000, pool, opts);
    expect(r[0]).toMatchObject({ exact: true, variance_cents: 0, sum_cents: 2_000_000, same_counterparty: true });
    expect(r[0].members.map((m) => m.ledger_entry_id).sort()).toEqual(["P-1", "P-2"]);
  });
  it("a purchase and a loan in the same line", () => {
    const pool = [c("factoring_advance", "P-7", 15_000, 0, "Faro"), c("related_party_loan", "LOAN-3", 5_000, 1, "Jorge Munoz")];
    const r = findAmountCombinations(2_000_000, pool, opts);
    expect(r[0].exact).toBe(true);
    expect(r[0].members.map((m) => m.ledger_entry_kind).sort()).toEqual(["factoring_advance", "related_party_loan"]);
  });
  it("a near sum is offered with its variance for Resolve difference, after every exact one", () => {
    const pool = [c("factoring_advance", "A", 10_000), c("factoring_advance", "B", 9_850), c("factoring_advance", "X", 12_000), c("factoring_advance", "Y", 8_000)];
    const r = findAmountCombinations(2_000_000, pool, opts);
    expect(r[0]).toMatchObject({ exact: true });                       // X + Y
    const near = r.find((x) => !x.exact)!;
    expect(near.variance_cents).toBe(15_000);                           // bank 20,000.00 − 19,850.00
  });
  it("never returns a single document (that is the normal list) and never exceeds maxItems", () => {
    const pool = [c("payment", "ONE", 20_000), ...Array.from({ length: 10 }, (_, i) => c("payment", `S${i}`, 2_000))];
    const r = findAmountCombinations(2_000_000, pool, { ...opts, maxItems: 4 });
    expect(r.every((x) => x.members.length >= 2 && x.members.length <= 4)).toBe(true);
  });
  it("returns nothing when no set adds up, and stays bounded on a large pool", () => {
    expect(findAmountCombinations(2_000_000, [c("payment", "A", 100), c("payment", "B", 200)], opts)).toEqual([]);
    const big = Array.from({ length: 1000 }, (_, i) => c("payment", `p${i}`, 1 + (i % 97) * 13.37, i % 30));
    const t = Date.now(); findAmountCombinations(5_123_456, big, opts); expect(Date.now() - t).toBeLessThan(2000);
  });
});
