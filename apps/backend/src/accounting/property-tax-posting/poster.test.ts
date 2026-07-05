import { describe, expect, it } from "vitest";
import {
  buildPropertyTaxAccrualPostings,
  buildPropertyTaxPaymentPostings,
} from "./poster.service.js";

// Pure GL-math builders — no DB, no flag. The flag-gated posters wrap these + createJournalEntry (the DB
// double-entry trigger tables enforce balance again at runtime).
describe("property-tax poster — accrual/payment GL math", () => {
  it("accrual is Dr expense / Cr payable, balanced", () => {
    const postings = buildPropertyTaxAccrualPostings("acct-expense", "acct-payable", 123_45, "memo");
    expect(postings).toHaveLength(2);
    expect(postings.find((p) => p.debit_or_credit === "debit")?.account_id).toBe("acct-expense");
    expect(postings.find((p) => p.debit_or_credit === "credit")?.account_id).toBe("acct-payable");
    const dTot = postings.filter((p) => p.debit_or_credit === "debit").reduce((s, p) => s + p.amount_cents, 0);
    const cTot = postings.filter((p) => p.debit_or_credit === "credit").reduce((s, p) => s + p.amount_cents, 0);
    expect(dTot).toBe(cTot);
    expect(dTot).toBe(123_45);
  });

  it("payment is Dr payable / Cr cash, balanced", () => {
    const postings = buildPropertyTaxPaymentPostings("acct-payable", "acct-cash", 500_00, "memo");
    expect(postings.find((p) => p.debit_or_credit === "debit")?.account_id).toBe("acct-payable");
    expect(postings.find((p) => p.debit_or_credit === "credit")?.account_id).toBe("acct-cash");
    const dTot = postings.filter((p) => p.debit_or_credit === "debit").reduce((s, p) => s + p.amount_cents, 0);
    const cTot = postings.filter((p) => p.debit_or_credit === "credit").reduce((s, p) => s + p.amount_cents, 0);
    expect(dTot).toBe(cTot);
    expect(dTot).toBe(500_00);
  });

  it("cash-basis direct payment debits the EXPENSE (no prior accrual), still crediting cash", () => {
    const postings = buildPropertyTaxPaymentPostings("acct-expense", "acct-cash", 250_00, "memo");
    expect(postings.find((p) => p.debit_or_credit === "debit")?.account_id).toBe("acct-expense");
    expect(postings.find((p) => p.debit_or_credit === "credit")?.account_id).toBe("acct-cash");
  });
});
