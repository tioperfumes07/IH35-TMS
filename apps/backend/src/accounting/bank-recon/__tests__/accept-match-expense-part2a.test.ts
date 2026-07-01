import { describe, expect, it, vi } from "vitest";
import { acceptMatchWithResolveDifference } from "../match.service.js";

const { mockQuery, mockWithLuciaBypass } = vi.hoisted(() => {
  const query = vi.fn();
  const withLuciaBypass = vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query }));
  return { mockQuery: query, mockWithLuciaBypass: withLuciaBypass };
});

vi.mock("../../../auth/db.js", () => ({
  withLuciaBypass: mockWithLuciaBypass,
}));

const OPCO = "11111111-1111-4111-8111-111111111111";
const ACTOR = "22222222-2222-4222-8222-222222222222";
const BANK_TX = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EXPENSE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function bankTxnRow(overrides: Record<string, unknown> = {}) {
  return {
    id: BANK_TX,
    bank_account_id: "acct-1",
    operating_company_id: OPCO,
    transaction_date: "2026-05-22",
    amount_cents: -10000, // money-out withdrawal, stored negative
    is_credit: false,
    description: "Fuel purchase",
    merchant_name: "Pilot",
    notes: null,
    review_state: "for_review",
    ...overrides,
  };
}

describe("BLOCK-01 Part 2a — expense-link accept", () => {
  it("links + clears a posted expense with no new JE and stamps matched_expense_id", async () => {
    mockQuery.mockReset();
    mockWithLuciaBypass.mockClear();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM banking.bank_transactions") && sql.includes("SELECT")) return { rows: [bankTxnRow()] };
      if (sql.includes("posting_status::text")) return { rows: [{ posting_status: "posted" }] };
      if (sql.includes("total_amount_cents::int")) return { rows: [{ amount_cents: 10000 }] }; // equal → zero variance
      return { rows: [] };
    });

    const result = await acceptMatchWithResolveDifference({
      operating_company_id: OPCO,
      bank_transaction_id: BANK_TX,
      actor_user_uuid: ACTOR,
      ledger_entry_kind: "expense",
      ledger_entry_id: EXPENSE,
      difference_account_id: "00000000-0000-4000-8000-000000000000",
    });

    expect(result.variance_cents).toBe(0);
    expect(result.difference_posted).toBe(false);
    expect(result.journal_entry_id).toBeNull();

    // no variance JE was created (link + clear only)
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO accounting.journal_entries"))).toBe(false);
    // match persisted as kind 'expense'
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO bank.reconciliation_matches"))).toBe(true);
    // bank line cleared via matched_expense_id
    const clear = mockQuery.mock.calls.find(([sql]) => String(sql).includes("UPDATE banking.bank_transactions"));
    expect(clear).toBeDefined();
    expect(String(clear?.[0])).toContain("matched_expense_id");
    expect(String(clear?.[0])).toContain("review_state = 'matched'");
  });

  it("rejects an unposted expense (would orphan the expense's own JE)", async () => {
    mockQuery.mockReset();
    mockWithLuciaBypass.mockClear();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM banking.bank_transactions") && sql.includes("SELECT")) return { rows: [bankTxnRow()] };
      if (sql.includes("posting_status::text")) return { rows: [{ posting_status: "unposted" }] };
      return { rows: [] };
    });

    await expect(
      acceptMatchWithResolveDifference({
        operating_company_id: OPCO,
        bank_transaction_id: BANK_TX,
        actor_user_uuid: ACTOR,
        ledger_entry_kind: "expense",
        ledger_entry_id: EXPENSE,
        difference_account_id: "00000000-0000-4000-8000-000000000000",
      })
    ).rejects.toThrow("expense_not_posted");
  });

  it("rejects a bank line already cleared (idempotency)", async () => {
    mockQuery.mockReset();
    mockWithLuciaBypass.mockClear();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM banking.bank_transactions") && sql.includes("SELECT"))
        return { rows: [bankTxnRow({ review_state: "matched" })] };
      return { rows: [] };
    });

    await expect(
      acceptMatchWithResolveDifference({
        operating_company_id: OPCO,
        bank_transaction_id: BANK_TX,
        actor_user_uuid: ACTOR,
        ledger_entry_kind: "expense",
        ledger_entry_id: EXPENSE,
        difference_account_id: "00000000-0000-4000-8000-000000000000",
      })
    ).rejects.toThrow("bank_transaction_already_matched");
  });
});
