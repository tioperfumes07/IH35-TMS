import { describe, expect, it, vi } from "vitest";
import { acceptMatchWithResolveDifference } from "../match.service.js";

// CODER-12 audit-spine: the bank-recon VARIANCE JE (postDifferenceJournalEntry) must write
// events.log_event once + one accounting.transaction_source_links row PER posting line, linking each
// line to the bank transaction. The match-only path (no variance) posts no GL JE and writes no link
// (it returns before postDifferenceJournalEntry), which is the re-scope GUARD asked for.
const { mockQuery, mockWithLuciaBypass } = vi.hoisted(() => {
  const query = vi.fn();
  const withLuciaBypass = vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query }));
  return { mockQuery: query, mockWithLuciaBypass: withLuciaBypass };
});

vi.mock("../../../auth/db.js", () => ({
  withLuciaBypass: mockWithLuciaBypass,
}));

const OPCO = "11111111-1111-4111-8111-111111111111";
const BANK_TX = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("CODER-12 audit-spine — bank-recon variance JE", () => {
  it("writes one events.log_event + one transaction_source_links row per posting line, linked to the bank transaction", async () => {
    mockQuery.mockReset();
    mockWithLuciaBypass.mockClear();

    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM banking.bank_transactions")) {
        return {
          rows: [
            {
              id: "tx-1",
              bank_account_id: "acct-9",
              operating_company_id: OPCO,
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
      if (sql.includes("SELECT amount_cents::int FROM accounting.payments")) return { rows: [{ amount_cents: 9000 }] };
      if (sql.includes("FROM banking.bank_accounts")) return { rows: [{ coa_account_id: "cash-account-1" }] };
      if (sql.includes("INSERT INTO bank.reconciliation_matches")) return { rows: [] };
      if (sql.includes("INSERT INTO accounting.journal_entries")) return { rows: [{ id: "je-diff-1" }] };
      // the variance JE inserts two posting lines; RETURNING id now yields both
      if (sql.includes("INSERT INTO accounting.journal_entry_postings")) return { rows: [{ id: "p1" }, { id: "p2" }] };
      return { rows: [] };
    });

    await acceptMatchWithResolveDifference({
      operating_company_id: OPCO,
      bank_transaction_id: BANK_TX,
      actor_user_uuid: "22222222-2222-4222-8222-222222222222",
      ledger_entry_kind: "payment",
      ledger_entry_id: "pay-0001",
      difference_account_id: "diff-account-9",
    });

    const calls = mockQuery.mock.calls;

    // exactly one spine event for the variance batch
    const eventCalls = calls.filter(([sql]) => String(sql).includes("events.log_event"));
    expect(eventCalls.length).toBe(1);

    // one source link per posting line (2 lines), each tying the line to the bank transaction
    const linkCalls = calls.filter(([sql]) => String(sql).includes("INSERT INTO accounting.transaction_source_links"));
    expect(linkCalls.length).toBe(2);
    for (const [, values] of linkCalls) {
      const v = values as unknown[];
      expect(v[0]).toBe(OPCO); // operating_company_id — entity-scoped
      expect(v[2]).toBe("bank_transaction"); // linked_object_type
      expect(v[3]).toBe(BANK_TX); // linked_object_id
      expect(v[4]).toBe("bank_reconciliation_variance"); // relationship_role
    }
  });
});
