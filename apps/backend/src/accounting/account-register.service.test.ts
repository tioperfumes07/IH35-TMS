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
    ...over,
  };
}

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
});
