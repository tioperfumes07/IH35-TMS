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

function setupBaseMocks() {
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM accounting.bill_payments")) return { rows: [] };
    if (sql.includes("FROM banking.transfers")) return { rows: [] };
    if (sql.includes("LEFT JOIN accounting.journal_entry_postings")) return { rows: [] };
    if (sql.includes("INSERT INTO banking.reconciliation_matches")) return { rows: [] };
    return { rows: [] };
  });
}

describe("bank-recon auto vs manual matching", () => {
  it("auto-matches when amount/date/similarity satisfy threshold", async () => {
    mockQuery.mockReset();
    setupBaseMocks();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM banking.bank_transactions")) {
        return {
          rows: [
            {
              id: "tx-auto",
              bank_account_id: "acct-1",
              operating_company_id: "11111111-1111-4111-8111-111111111111",
              transaction_date: "2026-05-21",
              amount_cents: 250000,
              is_credit: true,
              description: "Invoice ACME 4500",
              merchant_name: "ACME",
              notes: null,
            },
          ],
        };
      }
      if (sql.includes("FROM accounting.payments")) {
        return {
          rows: [{ id: "pay-1", amount_cents: 250000, event_date: "2026-05-20", memo: "ACME Invoice 4500" }],
        };
      }
      if (sql.includes("FROM accounting.bill_payments")) return { rows: [] };
      if (sql.includes("FROM banking.transfers")) return { rows: [] };
      if (sql.includes("LEFT JOIN accounting.journal_entry_postings")) return { rows: [] };
      if (sql.includes("INSERT INTO banking.reconciliation_matches")) return { rows: [] };
      return { rows: [] };
    });

    const candidates = await findCandidates({
      operating_company_id: "11111111-1111-4111-8111-111111111111",
      bank_transaction_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      actor_user_uuid: "22222222-2222-4222-8222-222222222222",
    });

    expect(candidates[0]?.auto_match).toBe(true);
    expect(candidates[0]?.ledger_entry_kind).toBe("payment");
    expect(
      mockQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO banking.reconciliation_matches"))
    ).toBe(true);
  });

  it("returns ranked manual candidates when similarity is too low", async () => {
    mockQuery.mockReset();
    setupBaseMocks();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM banking.bank_transactions")) {
        return {
          rows: [
            {
              id: "tx-manual",
              bank_account_id: "acct-2",
              operating_company_id: "11111111-1111-4111-8111-111111111111",
              transaction_date: "2026-05-21",
              amount_cents: 250000,
              is_credit: true,
              description: "Misc cash receipt",
              merchant_name: "Unknown",
              notes: null,
            },
          ],
        };
      }
      if (sql.includes("FROM accounting.payments")) {
        return {
          rows: [{ id: "pay-2", amount_cents: 250000, event_date: "2026-05-20", memo: "ACME Invoice 4500" }],
        };
      }
      if (sql.includes("FROM accounting.bill_payments")) return { rows: [] };
      if (sql.includes("FROM banking.transfers")) return { rows: [] };
      if (sql.includes("LEFT JOIN accounting.journal_entry_postings")) return { rows: [] };
      if (sql.includes("INSERT INTO banking.reconciliation_matches")) return { rows: [] };
      return { rows: [] };
    });

    const candidates = await findCandidates({
      operating_company_id: "11111111-1111-4111-8111-111111111111",
      bank_transaction_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });

    expect(candidates[0]?.auto_match).toBe(false);
    expect(
      mockQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO banking.reconciliation_matches"))
    ).toBe(false);
  });

  // ACCT-F5604 — banking.reconciliation_matches had 0 rows database-wide because every bank-
  // categorization JE candidate's memo is the poster's own boilerplate-wrapped label
  // ("Bank categorization: <description> <id> posting"), which scored ~0.6 against the bank
  // transaction's real description under the old 0.8 bar -- a real match, unconditionally rejected.
  // This proves the recalibrated 0.5 bar now lets that real match through while match-auto-vs-manual's
  // sibling test above (genuinely unrelated content, similarity 0) still correctly stays manual-only.
  it("auto-matches a JE candidate whose memo is boilerplate-diluted but is the real transaction", async () => {
    mockQuery.mockReset();
    setupBaseMocks();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM banking.bank_transactions")) {
        return {
          rows: [
            {
              id: "tx-je-auto",
              bank_account_id: "acct-3",
              operating_company_id: "11111111-1111-4111-8111-111111111111",
              transaction_date: "2026-05-21",
              amount_cents: 250000,
              is_credit: true,
              description: "ACME Invoice 4500",
              merchant_name: null,
              notes: null,
            },
          ],
        };
      }
      if (sql.includes("FROM accounting.payments")) return { rows: [] };
      if (sql.includes("FROM accounting.bill_payments")) return { rows: [] };
      if (sql.includes("FROM banking.transfers")) return { rows: [] };
      if (sql.includes("FROM accounting.journal_entries je")) {
        return {
          rows: [
            {
              id: "je-1",
              amount_cents: 250000,
              event_date: "2026-05-20",
              memo: "Bank categorization: ACME Invoice 4500 cb271ba0 posting",
            },
          ],
        };
      }
      if (sql.includes("LEFT JOIN accounting.journal_entry_postings")) return { rows: [] };
      if (sql.includes("INSERT INTO banking.reconciliation_matches")) return { rows: [] };
      return { rows: [] };
    });

    const candidates = await findCandidates({
      operating_company_id: "11111111-1111-4111-8111-111111111111",
      bank_transaction_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    });

    expect(candidates[0]?.ledger_entry_kind).toBe("je");
    expect(candidates[0]?.memo_similarity).toBeGreaterThanOrEqual(0.5);
    expect(candidates[0]?.memo_similarity).toBeLessThan(0.8);
    expect(candidates[0]?.auto_match).toBe(true);
    expect(
      mockQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO banking.reconciliation_matches"))
    ).toBe(true);
  });
});
