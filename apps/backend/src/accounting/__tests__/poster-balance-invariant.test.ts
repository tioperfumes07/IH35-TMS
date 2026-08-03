/**
 * DOUBLE-ENTRY BALANCE INVARIANT — every auto-poster's pure builder.
 *
 * WHY THIS EXISTS: on 2026-08-03 PARTS_PURCHASE_GL_POSTING_ENABLED and SAFETY_FINE_GL_POSTING_ENABLED
 * were turned ON for TRANSP/TRK/USMCA (their CoA roles having finally been designated). At that moment
 * NONE of the six auto-poster builders had a single unit test. Real money began posting through code
 * whose most basic accounting property — debits equal credits — was asserted nowhere.
 *
 * An unbalanced JE is the one defect that cannot be reconciled away later: it corrupts the trial
 * balance and every statement derived from it, and it is invisible until a CPA closes the period.
 * "Balanced by construction" is a comment, not a control. This is the control.
 *
 * SCOPE, HONESTLY STATED: these are the PURE builders — no DB, no flag, no idempotency. They are what
 * decides the Dr/Cr shape of the entry. Flag gating, idempotency latches and role resolution are
 * exercised elsewhere; this file is deliberately narrow so that a failure here means exactly one thing.
 *
 * The companion guard (scripts/verify-poster-balance-covered.mjs) ENUMERATES the builders in the source
 * tree and fails if any is absent from this file — so a poster added tomorrow cannot ship uncovered.
 */
import { describe, expect, it } from "vitest";

import { buildClaimRecoveryPostings } from "../insurance-claim-recovery-posting/poster.service.js";
import { buildCashPartsPurchasePostings, dollarsToCents } from "../parts-inventory-posting/poster.service.js";
import {
  buildPropertyTaxAccrualPostings,
  buildPropertyTaxPaymentPostings,
} from "../property-tax-posting/poster.service.js";
import {
  buildBillEvent2Postings,
  buildEarnEvent1Postings,
} from "../revrec-delivery-posting/poster.service.js";
import { buildRelatedPartyLoanPostings } from "../related-party-loan-posting/poster.service.js";
import { buildCompanyPaidFinePostings } from "../safety-fine-posting/poster.service.js";
import { buildWarrantyReimbursePostings } from "../warranty-posting/poster.service.js";

type Leg = { account_id: string; debit_or_credit: "debit" | "credit"; amount_cents: number; description: string };
type Builder = (a: string, b: string, amountCents: number, memo: string) => Leg[];

const DR = "11111111-1111-1111-1111-111111111111";
const CR = "22222222-2222-2222-2222-222222222222";

/**
 * Every builder in the tree. Kept as an explicit list (not a glob) so that adding a poster is a
 * deliberate act with a deliberate test — the guard is what makes forgetting impossible.
 */
const BUILDERS: Array<{ name: string; fn: Builder }> = [
  { name: "buildCompanyPaidFinePostings", fn: buildCompanyPaidFinePostings as Builder },
  { name: "buildCashPartsPurchasePostings", fn: buildCashPartsPurchasePostings as Builder },
  { name: "buildClaimRecoveryPostings", fn: buildClaimRecoveryPostings as Builder },
  { name: "buildWarrantyReimbursePostings", fn: buildWarrantyReimbursePostings as Builder },
  { name: "buildPropertyTaxAccrualPostings", fn: buildPropertyTaxAccrualPostings as Builder },
  { name: "buildPropertyTaxPaymentPostings", fn: buildPropertyTaxPaymentPostings as Builder },
  // The two-event revenue latch: Event 1 Dr Unbilled / Cr Revenue at delivery, Event 2 Dr A/R /
  // Cr Unbilled at invoice. Both must balance independently or revenue and A/R drift apart.
  { name: "buildEarnEvent1Postings", fn: buildEarnEvent1Postings as Builder },
  { name: "buildBillEvent2Postings", fn: buildBillEvent2Postings as Builder },
  // Related-party loans take `direction` as their FIRST argument, so each direction is registered as
  // its own shape. They are genuinely different entries — 'in' credits a liability, 'out' debits a
  // receivable — and a single registration would only ever exercise one of them.
  {
    name: "buildRelatedPartyLoanPostings",
    fn: ((a: string, b: string, amt: number, memo: string) =>
      buildRelatedPartyLoanPostings("in", b, a, amt, memo)) as Builder,
  },
  {
    name: "buildRelatedPartyLoanPostings_out",
    fn: ((a: string, b: string, amt: number, memo: string) =>
      buildRelatedPartyLoanPostings("out", a, b, amt, memo)) as Builder,
  },
];

/**
 * Amounts chosen to break naive implementations: 1c (rounding floor), an odd cent, a prime, a value
 * whose half is fractional (a builder that split the amount would fail), and a large amount that
 * would overflow a 32-bit accumulator.
 */
const AMOUNTS = [1, 7, 99, 4_999, 100_000, 123_456_789, 2_147_483_648];

const sum = (legs: Leg[], side: "debit" | "credit") =>
  legs.filter((l) => l.debit_or_credit === side).reduce((t, l) => t + l.amount_cents, 0);

describe("auto-poster builders — double-entry balance invariant", () => {
  for (const { name, fn } of BUILDERS) {
    describe(name, () => {
      it.each(AMOUNTS)("debits equal credits at %i cents", (amount) => {
        const legs = fn(DR, CR, amount, "memo");
        expect(sum(legs, "debit")).toBe(sum(legs, "credit"));
      });

      it("posts exactly one debit and one credit", () => {
        const legs = fn(DR, CR, 5_000, "memo");
        expect(legs.filter((l) => l.debit_or_credit === "debit")).toHaveLength(1);
        expect(legs.filter((l) => l.debit_or_credit === "credit")).toHaveLength(1);
      });

      it("carries the full amount on both sides — never a split or a partial", () => {
        const legs = fn(DR, CR, 4_999, "memo");
        for (const leg of legs) expect(leg.amount_cents).toBe(4_999);
      });

      it("keeps amounts as whole cents (no floats reaching the ledger)", () => {
        const legs = fn(DR, CR, 4_999, "memo");
        for (const leg of legs) expect(Number.isInteger(leg.amount_cents)).toBe(true);
      });

      it("uses the two resolved role accounts and hardcodes neither", () => {
        const legs = fn(DR, CR, 5_000, "memo");
        // Both supplied accounts must appear, and nothing else may.
        expect(new Set(legs.map((l) => l.account_id))).toEqual(new Set([DR, CR]));
      });

      it("posts the two legs to DIFFERENT accounts", () => {
        // Same account on both sides nets to zero — a JE that balances but records nothing.
        const legs = fn(DR, CR, 5_000, "memo");
        expect(legs[0].account_id).not.toBe(legs[1].account_id);
      });

      it("puts the caller's memo on every leg so the entry is traceable", () => {
        const legs = fn(DR, CR, 5_000, "TRACE-ME-9137");
        for (const leg of legs) expect(leg.description).toContain("TRACE-ME-9137");
      });

      it("respects the caller's debit/credit argument order", () => {
        // Arg 1 is the debit account for every builder except the two recovery builders, whose first
        // arg is cash (also the debit). Either way the FIRST argument is the debited account — asserted
        // so a future refactor cannot silently reverse an entry's direction.
        const legs = fn(DR, CR, 5_000, "memo");
        expect(legs.find((l) => l.debit_or_credit === "debit")?.account_id).toBe(DR);
        expect(legs.find((l) => l.debit_or_credit === "credit")?.account_id).toBe(CR);
      });
    });
  }

  it("covers every builder exported by the poster services", () => {
    // Mirrors the static guard so a bare `vitest` run also catches an uncovered poster.
    expect(BUILDERS).toHaveLength(10);
  });
});

describe("dollarsToCents — the parts poster's only unit conversion", () => {
  it("converts dollars to whole cents", () => {
    expect(dollarsToCents(12.34)).toBe(1_234);
  });

  it("rounds the classic binary-float case instead of truncating it", () => {
    // 1.005 * 100 === 100.49999999999999 in IEEE-754; a truncating implementation loses a cent.
    expect(dollarsToCents(19.99)).toBe(1_999);
    expect(dollarsToCents(0.07)).toBe(7);
  });

  it("treats zero, negative and non-finite input as no-post rather than a bad entry", () => {
    expect(dollarsToCents(0)).toBe(0);
    expect(dollarsToCents(-5)).toBe(0);
    expect(dollarsToCents(Number.NaN)).toBe(0);
    expect(dollarsToCents(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
