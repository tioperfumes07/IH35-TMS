import { describe, expect, it, vi } from "vitest";
import { findCandidates } from "../match.service.js";

const { mockQuery, mockWithLuciaBypass } = vi.hoisted(() => {
  const query = vi.fn();
  const withLuciaBypass = vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query }));
  return {
    mockQuery: query,
    mockWithLuciaBypass: withLuciaBypass,
  };
});

vi.mock("../../../auth/db.js", () => ({
  withLuciaBypass: mockWithLuciaBypass,
}));

describe("bank-recon match tenant isolation", () => {
  it("pins operating_company_id in app config and ledger queries", async () => {
    mockQuery.mockReset();
    mockWithLuciaBypass.mockClear();

    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM banking.bank_transactions")) {
        return {
          rows: [
            {
              id: "tx-1",
              bank_account_id: "acct-1",
              operating_company_id: "11111111-1111-4111-8111-111111111111",
              transaction_date: "2026-05-20",
              amount_cents: 10000,
              is_credit: true,
              description: "ACME Payment",
              merchant_name: "ACME",
              notes: null,
            },
          ],
        };
      }
      if (sql.includes("FROM accounting.payments")) {
        return { rows: [] };
      }
      if (sql.includes("FROM accounting.bill_payments")) {
        return { rows: [] };
      }
      if (sql.includes("FROM banking.transfers")) {
        return { rows: [] };
      }
      if (sql.includes("FROM accounting.journal_entries")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    await findCandidates({
      operating_company_id: "11111111-1111-4111-8111-111111111111",
      bank_transaction_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });

    const setConfigCall = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes("set_config('app.operating_company_id'")
    );
    expect(setConfigCall?.[1]).toEqual(["11111111-1111-4111-8111-111111111111"]);

    const bankTxnSql = String(
      mockQuery.mock.calls.find(([sql]) => String(sql).includes("FROM banking.bank_transactions"))?.[0] ?? ""
    );
    expect(bankTxnSql).toContain("operating_company_id = $2::uuid");

    const paymentSql = String(
      mockQuery.mock.calls.find(([sql]) => String(sql).includes("FROM accounting.payments"))?.[0] ?? ""
    );
    expect(paymentSql).toContain("operating_company_id = $1::uuid");
  });
});
