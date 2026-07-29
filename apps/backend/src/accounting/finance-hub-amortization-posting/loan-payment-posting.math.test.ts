/**
 * FH-3 loan-payment entry assembly — pure unit tests (no DB). These run everywhere, not just in CI,
 * so the balance/refusal contract of the 3-leg entry is proven on every push.
 */
import { describe, expect, it } from "vitest";
import {
  FINANCE_HUB_AMORTIZATION_POST_FLAG_KEY,
  LoanPaymentPostingError,
  buildLoanPaymentIdempotencyKey,
  buildLoanPaymentLines,
} from "./loan-payment-posting.math.js";

const accounts = {
  liabilityAccountId: "11111111-1111-4111-8111-111111111111",
  interestExpenseAccountId: "22222222-2222-4222-8222-222222222222",
  paymentAccountId: "33333333-3333-4333-8333-333333333333",
};
const sumBy = (lines: ReturnType<typeof buildLoanPaymentLines>, side: "debit" | "credit") =>
  lines.filter((l) => l.debit_or_credit === side).reduce((s, l) => s + l.amount_cents, 0);

describe("FH-3 loan-payment entry assembly", () => {
  it("gates on FINANCE_HUB_AMORTIZATION_POST_ENABLED", () => {
    expect(FINANCE_HUB_AMORTIZATION_POST_FLAG_KEY).toBe("FINANCE_HUB_AMORTIZATION_POST_ENABLED");
  });

  it("builds a balanced 3-leg entry: Dr principal + Dr interest / Cr payment", () => {
    const lines = buildLoanPaymentLines(
      { paymentNumber: 1, principalCents: 80000, interestCents: 5000, paymentCents: 85000 },
      accounts,
      "Truck note"
    );
    expect(lines).toHaveLength(3);
    expect(sumBy(lines, "debit")).toBe(85000);
    expect(sumBy(lines, "credit")).toBe(85000);
    expect(lines[0]).toMatchObject({ account_id: accounts.liabilityAccountId, debit_or_credit: "debit", amount_cents: 80000 });
    expect(lines[1]).toMatchObject({ account_id: accounts.interestExpenseAccountId, debit_or_credit: "debit", amount_cents: 5000 });
    expect(lines[2]).toMatchObject({ account_id: accounts.paymentAccountId, debit_or_credit: "credit", amount_cents: 85000 });
  });

  it("omits the zero legs: a 0% loan books 2 legs and needs no interest account", () => {
    const lines = buildLoanPaymentLines(
      { paymentNumber: 4, principalCents: 50000, interestCents: 0, paymentCents: 50000 },
      { ...accounts, interestExpenseAccountId: null },
      "Interest-free note"
    );
    expect(lines).toHaveLength(2);
    expect(sumBy(lines, "debit")).toBe(50000);
    expect(sumBy(lines, "credit")).toBe(50000);
  });

  it("books an interest-only period as Dr interest / Cr cash", () => {
    const lines = buildLoanPaymentLines(
      { paymentNumber: 1, principalCents: 0, interestCents: 1200, paymentCents: 1200 },
      accounts,
      "Interest-only note"
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ account_id: accounts.interestExpenseAccountId, debit_or_credit: "debit" });
    expect(sumBy(lines, "debit")).toBe(sumBy(lines, "credit"));
  });

  it("REFUSES a split that does not add up rather than plugging the difference", () => {
    expect(() =>
      buildLoanPaymentLines({ paymentNumber: 2, principalCents: 80000, interestCents: 5000, paymentCents: 84000 }, accounts, "Bad split")
    ).toThrowError(LoanPaymentPostingError);
    try {
      buildLoanPaymentLines({ paymentNumber: 2, principalCents: 80000, interestCents: 5000, paymentCents: 84000 }, accounts, "Bad split");
    } catch (e) {
      expect((e as LoanPaymentPostingError).code).toBe("ROW_SPLIT_MISMATCH");
    }
  });

  it("REFUSES non-integer, negative, and zero-payment rows (money is integer cents)", () => {
    const cases = [
      { paymentNumber: 1, principalCents: 100.5, interestCents: 0, paymentCents: 100.5 },
      { paymentNumber: 1, principalCents: -100, interestCents: 0, paymentCents: -100 },
      { paymentNumber: 1, principalCents: 0, interestCents: 0, paymentCents: 0 },
    ];
    for (const split of cases) {
      expect(() => buildLoanPaymentLines(split, accounts, "Bad row")).toThrowError(LoanPaymentPostingError);
    }
  });

  it("REFUSES interest with no interest-expense account designated (ACCOUNT_MISSING)", () => {
    try {
      buildLoanPaymentLines(
        { paymentNumber: 3, principalCents: 1000, interestCents: 250, paymentCents: 1250 },
        { ...accounts, interestExpenseAccountId: null },
        "No interest acct"
      );
      throw new Error("expected a refusal");
    } catch (e) {
      expect((e as LoanPaymentPostingError).code).toBe("ACCOUNT_MISSING");
    }
  });

  it("idempotency key is deterministic, case-insensitive, and per-payment", () => {
    const a = buildLoanPaymentIdempotencyKey("AAAAAAAA-0000-4000-8000-000000000001", "BBBBBBBB-0000-4000-8000-000000000002", 3);
    const b = buildLoanPaymentIdempotencyKey("aaaaaaaa-0000-4000-8000-000000000001", "bbbbbbbb-0000-4000-8000-000000000002", 3);
    const c = buildLoanPaymentIdempotencyKey("aaaaaaaa-0000-4000-8000-000000000001", "bbbbbbbb-0000-4000-8000-000000000002", 4);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.startsWith("ih35:loan-payment:v1:")).toBe(true);
  });
});
