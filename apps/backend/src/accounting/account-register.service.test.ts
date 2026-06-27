import { describe, it, expect } from "vitest";
import { buildRegisterRows, type RawPosting } from "./account-register.service.js";

function posting(over: Partial<RawPosting>): RawPosting {
  return {
    posting_id: "p",
    journal_entry_id: "je",
    entry_date: "2026-06-10",
    memo: null,
    description: null,
    debit_or_credit: "debit",
    amount_cents: 0,
    source_transaction_type: null,
    source_transaction_id: null,
    payee: null,
    split_account: null,
    class_name: null,
    ...over,
  };
}

// account_type → normal balance (QuickBooks sign convention). Used by the per-type worked examples below.
const NORMAL_BY_TYPE: Record<string, "debit" | "credit"> = {
  asset: "debit",
  expense: "debit",
  liability: "credit",
  income: "credit",
  equity: "credit",
};

describe("account register — running-balance math", () => {
  it("debit-normal account: balance rises on debits, falls on credits", () => {
    const { rows, closing_balance_cents, total_debit_cents, total_credit_cents } = buildRegisterRows(10000, "debit", [
      posting({ posting_id: "a", debit_or_credit: "debit", amount_cents: 5000 }),
      posting({ posting_id: "b", debit_or_credit: "credit", amount_cents: 2000 }),
    ]);
    expect(rows[0].running_balance_cents).toBe(15000); // 10000 + 5000 debit
    expect(rows[1].running_balance_cents).toBe(13000); // 15000 - 2000 credit
    expect(closing_balance_cents).toBe(13000);
    expect(total_debit_cents).toBe(5000);
    expect(total_credit_cents).toBe(2000);
    expect(rows[0].debit_cents).toBe(5000);
    expect(rows[1].credit_cents).toBe(2000);
  });

  it("credit-normal account: balance rises on credits, falls on debits", () => {
    const { rows, closing_balance_cents } = buildRegisterRows(10000, "credit", [
      posting({ debit_or_credit: "credit", amount_cents: 3000 }),
      posting({ debit_or_credit: "debit", amount_cents: 1000 }),
    ]);
    expect(rows[0].running_balance_cents).toBe(13000); // 10000 + 3000 credit
    expect(rows[1].running_balance_cents).toBe(12000); // 13000 - 1000 debit
    expect(closing_balance_cents).toBe(12000);
  });

  it("labels the row type from the source transaction, defaulting to Journal Entry", () => {
    const { rows } = buildRegisterRows(0, "debit", [
      posting({ source_transaction_type: "invoice", source_transaction_id: "INV-1" }),
      posting({ source_transaction_type: null }),
      posting({ source_transaction_type: "bill_payment", source_transaction_id: "BP-9" }),
    ]);
    expect(rows[0].type).toBe("Invoice");
    expect(rows[0].reference).toBe("INV-1");
    expect(rows[1].type).toBe("Journal Entry");
    expect(rows[2].type).toBe("Bill Payment");
  });

  it("opening balance carries through an empty period", () => {
    const { rows, closing_balance_cents } = buildRegisterRows(4200, "debit", []);
    expect(rows).toEqual([]);
    expect(closing_balance_cents).toBe(4200);
  });

  it("carries QBO-parity fields (payee / split account / class) through to the row", () => {
    const { rows } = buildRegisterRows(0, "debit", [
      posting({ payee: "Love's Travel Stop", split_account: "-Split-", class_name: "TRK-101" }),
    ]);
    expect(rows[0].payee).toBe("Love's Travel Stop");
    expect(rows[0].split_account).toBe("-Split-");
    expect(rows[0].class_name).toBe("TRK-101");
  });
});

// COMPLETE-BUILD: prove the running-balance sign is correct for EVERY account_type. The sign is driven by
// the account's normal balance: debit-normal (asset, expense) rises on debits; credit-normal (liability,
// income, equity) rises on credits. One $100 debit then one $40 credit, opening 1000¢, per type.
describe("account register — running balance per account_type", () => {
  for (const [accountType, normal] of Object.entries(NORMAL_BY_TYPE)) {
    it(`${accountType} (${normal}-normal): debit then credit moves the balance the right way`, () => {
      const { rows, closing_balance_cents } = buildRegisterRows(1000, normal, [
        posting({ debit_or_credit: "debit", amount_cents: 10000 }),
        posting({ debit_or_credit: "credit", amount_cents: 4000 }),
      ]);
      if (normal === "debit") {
        expect(rows[0].running_balance_cents).toBe(11000); // 1000 + 10000 debit
        expect(rows[1].running_balance_cents).toBe(7000); //  11000 - 4000 credit
        expect(closing_balance_cents).toBe(7000);
      } else {
        expect(rows[0].running_balance_cents).toBe(-9000); // 1000 - 10000 debit (debit lowers a credit-normal acct)
        expect(rows[1].running_balance_cents).toBe(-5000); // -9000 + 4000 credit
        expect(closing_balance_cents).toBe(-5000);
      }
    });
  }
});
