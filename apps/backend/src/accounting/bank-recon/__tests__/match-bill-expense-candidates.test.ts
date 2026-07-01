import { describe, expect, it, vi } from "vitest";
import { findCandidates } from "../match.service.js";

const { mockQuery, mockWithLuciaBypass } = vi.hoisted(() => {
  const query = vi.fn();
  const withLuciaBypass = vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query }));
  return { mockQuery: query, mockWithLuciaBypass: withLuciaBypass };
});

vi.mock("../../../auth/db.js", () => ({
  withLuciaBypass: mockWithLuciaBypass,
}));

const TRANSP = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";

function withdrawalTxn() {
  return {
    id: "tx-out",
    bank_account_id: "acct-1",
    operating_company_id: TRANSP,
    transaction_date: "2026-05-20",
    amount_cents: 50000,
    is_credit: false, // money OUT
    description: "Pilot Fuel 8842",
    merchant_name: "Pilot",
    notes: null,
  };
}

function depositTxn() {
  return {
    id: "tx-in",
    bank_account_id: "acct-1",
    operating_company_id: TRANSP,
    transaction_date: "2026-05-20",
    amount_cents: 250000,
    is_credit: true, // money IN
    description: "ACME Invoice 4500",
    merchant_name: "ACME",
    notes: null,
  };
}

describe("bank-recon bill/expense candidates + direction awareness", () => {
  it("withdrawal ranks an open bill + surfaces an expense, and never AR payments", async () => {
    mockQuery.mockReset();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM banking.bank_transactions")) return { rows: [withdrawalTxn()] };
      if (sql.includes("FROM accounting.payments")) {
        // AR receipt fixture — must NOT be offered for a withdrawal.
        return { rows: [{ id: "pay-should-not-appear", amount_cents: 50000, event_date: "2026-05-20", memo: "Pilot Fuel 8842" }] };
      }
      if (sql.includes("FROM accounting.bill_payments")) return { rows: [] };
      if (sql.includes("FROM accounting.bills b")) {
        return { rows: [{ id: "bill-1", amount_cents: 50000, event_date: "2026-05-20", memo: "Pilot Fuel 8842" }] };
      }
      if (sql.includes("FROM accounting.expenses e")) {
        return { rows: [{ id: "exp-1", amount_cents: 12000, event_date: "2026-05-19", memo: "Scale ticket" }] };
      }
      if (sql.includes("FROM banking.transfers")) return { rows: [] };
      if (sql.includes("LEFT JOIN accounting.journal_entry_postings")) return { rows: [] };
      if (sql.includes("INSERT INTO bank.reconciliation_matches")) return { rows: [] };
      return { rows: [] };
    });

    const candidates = await findCandidates({
      operating_company_id: TRANSP,
      bank_transaction_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      actor_user_uuid: "22222222-2222-4222-8222-222222222222",
    });

    const kinds = candidates.map((c) => c.ledger_entry_kind);
    // Bill is the exact amount+memo match → ranked first.
    expect(candidates[0]?.ledger_entry_kind).toBe("bill");
    expect(kinds).toContain("bill");
    expect(kinds).toContain("expense");
    // Withdrawal must NOT surface AR payments (money-in only).
    expect(kinds).not.toContain("payment");

    // The AR payments query must not even run for a withdrawal (direction gating).
    expect(mockQuery.mock.calls.some(([s]) => String(s).includes("FROM accounting.payments"))).toBe(false);

    // Even though the top auto-match is a bill, it MUST NOT be persisted (CHECK-constraint guard →
    // stays Tier-3).
    expect(mockQuery.mock.calls.some(([s]) => String(s).includes("INSERT INTO bank.reconciliation_matches"))).toBe(false);
  });

  it("deposit surfaces AR payments and NEVER bills/expenses (never crosses the streams)", async () => {
    mockQuery.mockReset();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM banking.bank_transactions")) return { rows: [depositTxn()] };
      if (sql.includes("FROM accounting.payments")) {
        return { rows: [{ id: "pay-1", amount_cents: 250000, event_date: "2026-05-20", memo: "ACME Invoice 4500" }] };
      }
      // These would return rows if (wrongly) queried on a deposit.
      if (sql.includes("FROM accounting.bills b")) return { rows: [{ id: "bill-x", amount_cents: 250000, event_date: "2026-05-20", memo: "ACME" }] };
      if (sql.includes("FROM accounting.expenses e")) return { rows: [{ id: "exp-x", amount_cents: 250000, event_date: "2026-05-20", memo: "ACME" }] };
      if (sql.includes("FROM accounting.bill_payments")) return { rows: [] };
      if (sql.includes("FROM banking.transfers")) return { rows: [] };
      if (sql.includes("LEFT JOIN accounting.journal_entry_postings")) return { rows: [] };
      if (sql.includes("INSERT INTO bank.reconciliation_matches")) return { rows: [] };
      return { rows: [] };
    });

    const candidates = await findCandidates({
      operating_company_id: TRANSP,
      bank_transaction_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });

    const kinds = candidates.map((c) => c.ledger_entry_kind);
    expect(kinds).toContain("payment");
    expect(kinds).not.toContain("bill");
    expect(kinds).not.toContain("expense");

    // The bill/expense candidate queries must not run for a deposit.
    expect(mockQuery.mock.calls.some(([s]) => String(s).includes("FROM accounting.bills b"))).toBe(false);
    expect(mockQuery.mock.calls.some(([s]) => String(s).includes("FROM accounting.expenses e"))).toBe(false);
  });
});
