import { describe, expect, it, vi } from "vitest";
import { acceptMatchWithResolveDifference } from "../match.service.js";

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

describe("bank-recon resolve difference Q8 compliance", () => {
  it("posts variance to chosen JE account and recognizes actual cash hit", async () => {
    mockQuery.mockReset();
    mockWithLuciaBypass.mockClear();

    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM banking.bank_transactions")) {
        return {
          rows: [
            {
              id: "tx-resolve",
              bank_account_id: "acct-9",
              operating_company_id: "11111111-1111-4111-8111-111111111111",
              transaction_date: "2026-05-22",
              amount_cents: 10000,
              is_credit: true,
              description: "Customer wire",
              merchant_name: "Acme",
              notes: null,
            },
          ],
        };
      }
      if (sql.includes("SELECT amount_cents::int FROM accounting.payments")) {
        return { rows: [{ amount_cents: 9000 }] };
      }
      // GO-CLOSE-188 DEFECT A: the deposit-sweep poster's own payment lookup (FOR UPDATE). No
      // source_bank_transaction_id yet in this fixture's reality -> sweep skips (PAYMENT_NOT_POSTING_ELIGIBLE),
      // matching this test's actual scope (variance-JE posting, not the deposit sweep).
      if (sql.includes("FROM accounting.payments") && sql.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              id: "pay-0001",
              payment_date: "2026-05-22",
              amount_cents: 9000,
              display_id: "PMT-1",
              deposited_to_account_id: null,
              voided_at: null,
              source_system: null,
              qbo_payment_id: null,
              source_bank_transaction_id: null,
            },
          ],
        };
      }
      if (sql.includes("FROM banking.bank_accounts")) {
        return { rows: [{ ledger_account_id: "cash-account-1" }] };
      }
      if (sql.includes("INSERT INTO banking.reconciliation_matches")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO accounting.journal_entries")) {
        return { rows: [{ id: "je-diff-1" }] };
      }
      if (sql.includes("INSERT INTO accounting.journal_entry_postings")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const result = await acceptMatchWithResolveDifference({
      operating_company_id: "11111111-1111-4111-8111-111111111111",
      bank_transaction_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      actor_user_uuid: "22222222-2222-4222-8222-222222222222",
      ledger_entry_kind: "payment",
      ledger_entry_id: "pay-0001",
      difference_account_id: "diff-account-9",
    });

    expect(result.variance_cents).toBe(1000);
    expect(result.difference_posted).toBe(true);
    expect(result.journal_entry_id).toBe("je-diff-1");
    expect(result.cash_basis_revenue_cents).toBe(10000);

    const postingsInsert = String(
      mockQuery.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO accounting.journal_entry_postings"))?.[0] ?? ""
    );
    expect(postingsInsert).toContain("Bank reconciliation variance leg");
    expect(postingsInsert).toContain("Bank reconciliation offset leg");
  });
});
