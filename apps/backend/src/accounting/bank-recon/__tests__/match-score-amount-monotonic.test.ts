/**
 * ACCT-F179 — the bank-match amount term must be MONOTONIC in the gap.
 *
 * WHAT WAS BROKEN (observed live on USMCA 2026-08-07): the match drawer for a $918.00 Zelle line
 * ranked a JE off by $853.80 ABOVE one off by $282.00, and gaps of $282.00 and $604.10 scored
 * identically. `amountScore` was `max(0, 1 - gap/tolerance)` and tolerance is $1.00 on a $918 line, so
 * every real candidate clamped to 0 — the 0.55 weight, the majority of the score, contributed nothing
 * and the ranking fell through to a 0.25 fuzzy-memo term. A bank reconciliation was picking its top
 * suggestion by text while ignoring the money.
 *
 * WHY A PROPERTY TEST RATHER THAN FOUR EXPECTED NUMBERS. Pinning the four live scores would pass while
 * the ranking is wrong for the next transaction, and would break the moment anyone legitimately
 * retunes the weights — the same "guard pins a call site" trap that has already cost this repo a fix.
 * The INVARIANT is what matters: with date and memo held equal, a smaller amount gap must never score
 * lower than a larger one. That holds for any weights, any tolerance and any transaction size.
 */
import { describe, expect, it } from "vitest";
import { computeMatchScore, compareCandidatesExactFirst } from "../match.service.js";

const TOL = (amountCents: number) => Math.max(100, Math.round(Math.abs(amountCents) * 0.0001));

function score(gapCents: number, amountCents: number, dateGapDays = 1, similarity = 0.2) {
  return computeMatchScore({
    amountGapCents: gapCents,
    toleranceCents: TOL(amountCents),
    dateGapDays,
    similarity,
    txnAmountCents: amountCents,
  });
}

describe("ACCT-F179 — bank match amount score is monotonic in the gap", () => {
  it("the live $918.00 case now ranks the CLOSEST amount first", () => {
    // The exact four candidates from the drawer, with date and memo held equal so only amount varies.
    const amount = 91_800;
    const ranked = [
      { label: "JE $64.20", gap: Math.abs(amount - 6_420) },
      { label: "JE $1,200.00", gap: Math.abs(amount - 120_000) },
      { label: "JE $313.90", gap: Math.abs(amount - 31_390) },
      { label: "JE $33.40", gap: Math.abs(amount - 3_340) },
    ]
      .map((c) => ({ ...c, s: score(c.gap, amount) }))
      .sort((a, b) => b.s - a.s);

    // $1,200 is off by $282.00 — the smallest gap of the four. It used to rank SECOND.
    expect(ranked[0]!.label).toBe("JE $1,200.00");
    // And the order is strictly by closeness, not merely "the best one won".
    expect(ranked.map((r) => r.gap)).toEqual([...ranked.map((r) => r.gap)].sort((a, b) => a - b));
  });

  it("a smaller gap NEVER scores lower than a larger one, across magnitudes", () => {
    // Spans a $50 line to a $50,000 one: the term is relative to the transaction, so it must hold at
    // both ends. A fixed-tolerance formula fails this at large amounts and an absolute one at small.
    for (const amount of [5_000, 91_800, 1_000_000, 5_000_000]) {
      // SORTED — the list mixes fixed gaps with amount-relative ones, so for a small transaction
      // `amount` lands between them. Comparing unsorted pairs failed this test on its first run and
      // that was the test's bug, not the formula's.
      const gaps = [0, 1, 99, 100, 1_000, 28_200, 60_410, 85_380, amount, amount * 3].sort((a, b) => a - b);
      for (let i = 1; i < gaps.length; i++) {
        const closer = score(gaps[i - 1]!, amount);
        const farther = score(gaps[i]!, amount);
        expect(
          closer,
          `amount ${amount}: gap ${gaps[i - 1]} scored ${closer} but gap ${gaps[i]} scored ${farther} — ` +
            `a closer amount must never score lower`
        ).toBeGreaterThanOrEqual(farther);
      }
    }
  });

  it("distinct gaps outside tolerance produce DISTINCT scores — the clamp made them tie", () => {
    // $282.00 and $604.10 scored identically before, which is what let memo text decide the ranking.
    const amount = 91_800;
    expect(score(28_200, amount)).not.toBe(score(60_410, amount));
  });

  it("within tolerance still scores a perfect 1.0 so an exact match wins decisively", () => {
    const amount = 91_800;
    const exact = score(0, amount, 0, 1);
    const nearMiss = score(TOL(amount) + 1, amount, 0, 1);
    expect(exact).toBeGreaterThan(nearMiss);
    // Tolerance answers "is this the same transaction?"; this change must not widen it.
    expect(score(TOL(amount), amount)).toBe(score(0, amount));
  });
});

describe("FAIL-BM2 — an exact amount must never rank below a near miss", () => {
  // Ordering is the property under test, so this exercises the same comparator the service uses rather
  // than re-asserting score arithmetic (which match_score keeps, deliberately unchanged).
  // Bound to the SERVICE's own comparator — a local copy here would keep passing if the service changed,
  // which is precisely the failure mode this suite exists to catch.
  const byExactThenScore = compareCandidatesExactFirst;

  it("puts the exact-amount candidate first even when a $1-off candidate scores higher", () => {
    const txnAmountCents = 1500;
    // Exact amount, but nothing else matches: stale date, no memo overlap.
    const exact = {
      exact_amount: true,
      match_score: computeMatchScore({
        amountGapCents: 0, toleranceCents: 0, dateGapDays: 4, similarity: 0, txnAmountCents,
      }),
    };
    // $1 off, but a perfect memo and same-day date.
    const nearMiss = {
      exact_amount: false,
      match_score: computeMatchScore({
        amountGapCents: 100, toleranceCents: 0, dateGapDays: 0, similarity: 1, txnAmountCents,
      }),
    };

    // The inversion is real — this is the defect, and the score still reflects it.
    expect(nearMiss.match_score).toBeGreaterThan(exact.match_score);

    // ...but ordering must not.
    const ranked = [nearMiss, exact].sort(byExactThenScore);
    expect(ranked[0]).toBe(exact);
  });

  it("still ranks two exact-amount candidates by score", () => {
    const txnAmountCents = 1500;
    const better = {
      exact_amount: true,
      match_score: computeMatchScore({ amountGapCents: 0, toleranceCents: 0, dateGapDays: 0, similarity: 1, txnAmountCents }),
    };
    const worse = {
      exact_amount: true,
      match_score: computeMatchScore({ amountGapCents: 0, toleranceCents: 0, dateGapDays: 4, similarity: 0, txnAmountCents }),
    };
    expect([worse, better].sort(byExactThenScore)[0]).toBe(better);
  });
});
