import { describe, it, expect } from "vitest";
import { buildRegisterRows, getAccountRegister, type RawPosting } from "./account-register.service.js";

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
    reference_display_id: null,
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
    expect(rows[0].reference).toBe(null); // reference_display_id not resolved for this fixture row
    expect(rows[0].source_transaction_id).toBe("INV-1"); // raw id still passed through for drill-through routing
    expect(rows[1].type).toBe("Journal Entry");
    expect(rows[2].type).toBe("Bill Payment");
  });

  // ACCT-REGISTER-REF-IS-SOURCE-UUID: `reference` must be the resolved human document id
  // (reference_display_id from the query's own COALESCE over display_id/bill_number/expense_number),
  // never the raw source_transaction_id UUID — even when both are populated on the same row.
  it("reference is the human document id, not the raw source_transaction_id UUID", () => {
    const { rows } = buildRegisterRows(0, "debit", [
      posting({
        source_transaction_type: "bill",
        source_transaction_id: "5c854333-6ea5-4faa-af31-67cb272fef80", // a real-shaped UUID
        reference_display_id: "B-20260810-0003", // the resolved human bill_number
      }),
    ]);
    expect(rows[0].reference).toBe("B-20260810-0003");
    expect(rows[0].source_transaction_id).toBe("5c854333-6ea5-4faa-af31-67cb272fef80");
    expect(rows[0].reference).not.toBe(rows[0].source_transaction_id);
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

// ACCT-F51: fn_account_balances_as_of excludes accounts whose opening AND closing balance are both
// exactly $0 (e.g. a wash entry — equal offsetting debit + credit to the same account). Before the fix,
// getAccountRegister threw "account_not_found" for any such REAL, existing, non-deactivated account —
// crashing the page (404 → "Couldn't load the register") instead of rendering an honest empty register.
// Reproduced live 2026-07-29 on prod: TRANSP "Income Accounts" (acct QBO-1150040073) has a 1-cent debit +
// 1-cent credit on 2026-05-19 that net to $0, and 404'd the account-register endpoint.
describe("account register — zero-net (wash) account does not crash", () => {
  function mockClient(opts: { hasMeta: boolean }) {
    const calls: string[] = [];
    return {
      calls,
      query: async (sql: string) => {
        calls.push(sql);
        if (sql.includes("fn_account_balances_as_of")) {
          return { rows: [] }; // excluded by the HAVING clause — opening AND closing are both $0
        }
        if (sql.includes("FROM catalogs.accounts")) {
          return {
            rows: opts.hasMeta
              ? [{ account_id: "acct-1", account_code: "QBO-1150040073", account_name: "Income Accounts", account_type: "Income" }]
              : [],
          };
        }
        // postings query
        return { rows: [] };
      },
    };
  }

  it("renders an honest $0 / 0-row register instead of throwing account_not_found", async () => {
    const client = mockClient({ hasMeta: true });
    const report = await getAccountRegister(client, {
      operating_company_id: "co-1",
      account_id: "acct-1",
      from_date: "2026-01-01",
      to_date: "2026-12-31",
    });
    expect(report.account.account_name).toBe("Income Accounts");
    expect(report.account.normal_balance).toBe("credit"); // Income → credit-normal
    expect(report.opening_balance_cents).toBe(0);
    expect(report.closing_balance_cents).toBe(0);
    expect(report.rows).toEqual([]);
    expect(client.calls.some((s) => s.includes("fn_account_balances_as_of"))).toBe(true); // still reused first
  });

  it("still throws account_not_found for a genuinely unknown / cross-entity account_id", async () => {
    const client = mockClient({ hasMeta: false });
    await expect(
      getAccountRegister(client, {
        operating_company_id: "co-1",
        account_id: "does-not-exist",
        from_date: "2026-01-01",
        to_date: "2026-12-31",
      })
    ).rejects.toThrow("account_not_found");
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
