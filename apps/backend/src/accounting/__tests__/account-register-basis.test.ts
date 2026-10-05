import { describe, expect, it } from "vitest";
import { applyRegisterBasis, buildRegisterRows, type RawPosting } from "../account-register.service";
import { applyCashBasisSuppression, type CashBasisEntry } from "../cash-basis/engine";

/**
 * ACCT-F410 — the register must answer in the basis asked for, and its answer must be the SAME
 * answer the Trial Balance and Balance Sheet give for that account. Both halves are asserted here:
 * the register's behavior, and the TIE to the reports' own engine.
 */

const AR_ID = "11111111-1111-4111-8111-111111111111";
const AP_ID = "22222222-2222-4222-8222-222222222222";
const FUEL_ID = "33333333-3333-4333-8333-333333333333";
const AS_OF = "2026-10-05";

function posting(id: string, side: "debit" | "credit", cents: number): RawPosting {
  return {
    posting_id: id,
    journal_entry_id: `je-${id}`,
    entry_date: "2026-10-01",
    memo: null,
    description: null,
    debit_or_credit: side,
    amount_cents: cents,
  } as RawPosting;
}

const POSTINGS = [posting("p1", "debit", 150_000), posting("p2", "credit", 50_000)];

const ROLES = { arControlAccountId: AR_ID, apControlAccountId: AP_ID };

/** What the REPORTS do to one account, straight through their own engine — the thing to tie to. */
function reportAnswerForAccount(
  account: { account_id: string; account_code: string; account_name: string; account_type: string },
  closingCents: number
): number {
  const sourceType: CashBasisEntry["source_type"] =
    account.account_id === ROLES.arControlAccountId
      ? "ar_control"
      : account.account_id === ROLES.apControlAccountId
        ? "ap_control"
        : "other";
  const [out] = applyCashBasisSuppression(
    [{ ...account, entry_id: account.account_id, amount_cents: closingCents, source_type: sourceType }],
    { as_of_date: AS_OF }
  );
  return out.amount_cents;
}

const AR = { account_id: AR_ID, account_code: "1200", account_name: "Accounts Receivable", account_type: "Asset" };
const AP = { account_id: AP_ID, account_code: "2000", account_name: "Accounts Payable", account_type: "Liability" };
const FUEL = { account_id: FUEL_ID, account_code: "6100", account_name: "Fuel", account_type: "Expense" };

describe("ACCT-F410 — accrual is untouched", () => {
  it("returns the postings byte-for-byte and never reports suppression", () => {
    for (const account of [AR, AP, FUEL]) {
      const out = applyRegisterBasis({ basis: "accrual", postings: POSTINGS, account, asOfDate: AS_OF, roleMatches: ROLES });
      expect(out.suppressed, `${account.account_name} on accrual`).toBe(false);
      expect(out.postings).toBe(POSTINGS); // same reference: no copy, no change
    }
  });

  it("an accrual register is identical with or without role ids — accrual needs no classification", () => {
    const withRoles = applyRegisterBasis({ basis: "accrual", postings: POSTINGS, account: AR, asOfDate: AS_OF, roleMatches: ROLES });
    const without = applyRegisterBasis({ basis: "accrual", postings: POSTINGS, account: AR, asOfDate: AS_OF });
    expect(withRoles.postings).toEqual(without.postings);
  });
});

describe("ACCT-F410 — cash basis, and the tie to the reports", () => {
  it("zeroes the A/R control register and says so, matching the report's 0 for that account", () => {
    const out = applyRegisterBasis({ basis: "cash", postings: POSTINGS, account: AR, asOfDate: AS_OF, roleMatches: ROLES });
    expect(out.suppressed).toBe(true);
    // The ROWS remain — the transactions are real; what cash basis denies them is recognition.
    expect(out.postings).toHaveLength(POSTINGS.length);
    expect(out.postings.map((p) => p.posting_id)).toEqual(["p1", "p2"]);
    expect(out.postings.every((p) => p.amount_cents === 0)).toBe(true);
    // THE TIE: the report's own engine says 0 for this account; so does the register.
    expect(reportAnswerForAccount(AR, 100_000)).toBe(0);
  });

  it("zeroes the A/P control register the same way", () => {
    const out = applyRegisterBasis({ basis: "cash", postings: POSTINGS, account: AP, asOfDate: AS_OF, roleMatches: ROLES });
    expect(out.suppressed).toBe(true);
    expect(out.postings.every((p) => p.amount_cents === 0)).toBe(true);
    expect(reportAnswerForAccount(AP, 100_000)).toBe(0);
  });

  it("leaves every OTHER account alone, because that is what the reports do", () => {
    const out = applyRegisterBasis({ basis: "cash", postings: POSTINGS, account: FUEL, asOfDate: AS_OF, roleMatches: ROLES });
    expect(out.suppressed).toBe(false);
    expect(out.postings).toBe(POSTINGS);
    // THE TIE, the other direction: the report keeps this account whole on cash basis too.
    expect(reportAnswerForAccount(FUEL, 100_000)).toBe(100_000);
  });

  it("falls back to the engine's NAME heuristic when the COA role is unset, exactly as the reports do", () => {
    // Role ids absent — an A/R account must still suppress, or a company that never mapped the
    // role would get a cash register that disagrees with its own cash trial balance.
    const out = applyRegisterBasis({ basis: "cash", postings: POSTINGS, account: AR, asOfDate: AS_OF });
    expect(out.suppressed).toBe(true);
    expect(out.postings.every((p) => p.amount_cents === 0)).toBe(true);
  });

  it("does not mistake an already-zero account for a suppressed one", () => {
    // The probe is 1 cent, not 0, precisely so this case is distinguishable.
    const zeroPostings = [posting("z1", "debit", 0)];
    const out = applyRegisterBasis({ basis: "cash", postings: zeroPostings, account: FUEL, asOfDate: AS_OF, roleMatches: ROLES });
    expect(out.suppressed).toBe(false);
    expect(out.postings).toBe(zeroPostings);
  });
});

describe("ACCT-F410 — the whole register follows from the one decision", () => {
  it("a suppressed account's totals and running balance are all zero, not just its rows", () => {
    const { postings } = applyRegisterBasis({ basis: "cash", postings: POSTINGS, account: AR, asOfDate: AS_OF, roleMatches: ROLES });
    // Opening is passed as 0 by the service for a suppressed account — see the call site comment.
    const built = buildRegisterRows(0, "debit", postings);
    expect(built.total_debit_cents).toBe(0);
    expect(built.total_credit_cents).toBe(0);
    expect(built.closing_balance_cents).toBe(0);
    expect(built.rows.every((r) => r.running_balance_cents === 0)).toBe(true);
    expect(built.rows).toHaveLength(2);
  });

  it("an unsuppressed account's register is arithmetically unchanged by asking for cash", () => {
    const accrual = buildRegisterRows(10_000, "debit", POSTINGS);
    const cash = buildRegisterRows(
      10_000,
      "debit",
      applyRegisterBasis({ basis: "cash", postings: POSTINGS, account: FUEL, asOfDate: AS_OF, roleMatches: ROLES }).postings
    );
    expect(cash.total_debit_cents).toBe(accrual.total_debit_cents);
    expect(cash.total_credit_cents).toBe(accrual.total_credit_cents);
    expect(cash.closing_balance_cents).toBe(accrual.closing_balance_cents);
  });
});
