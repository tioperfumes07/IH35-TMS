import { describe, expect, it, vi } from "vitest";
import { findCandidates } from "../match.service.js";

// LEAD 443.168 N — the Match drawer's Transfer / Journal Entry / Relay fuel chips "can never return a row" (my 443.153 audit):
// fetchLedgerCandidates had no such sources. Register 1.4: the universe is every document, scoped to the line's own account.
// Fails on the old engine (no transfer / je / relay_fuel query is ever issued).

const { mockQuery, mockWithLuciaBypass } = vi.hoisted(() => {
  const query = vi.fn();
  const withLuciaBypass = vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query }));
  return { mockQuery: query, mockWithLuciaBypass: withLuciaBypass };
});
vi.mock("../../../auth/db.js", () => ({ withLuciaBypass: mockWithLuciaBypass }));

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
function install(opts: { isCredit: boolean; register: { ledger_id: string; operating: boolean; relay_wallet: boolean } }) {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM banking.bank_accounts ba")) return { rows: [{ ...opts.register, undeposited_id: null, card: false }] };
    if (sql.includes("FROM banking.bank_transactions bt") && sql.includes("WHERE bt.id = $1::uuid")) {
      return { rows: [{ id: "tx-1", bank_account_id: "ba-1", operating_company_id: CO, transaction_date: "2026-09-10", amount_cents: opts.isCredit ? 50000 : -50000, is_credit: opts.isCredit, description: "TRANSFER", merchant_name: null, notes: null, review_state: "for_review" }] };
    }
    if (sql.includes("FROM banking.transfers t")) return { rows: [{ id: "tr-1", amount_cents: 50000, event_date: "2026-09-10", memo: "To savings", reference: "bank_to_bank", description: "To savings" }] };
    if (sql.includes("FROM accounting.journal_entries je")) return { rows: [{ id: "je-1", amount_cents: 50000, event_date: "2026-09-10", memo: "Owner contribution", reference: "je-1", description: "Owner contribution" }] };
    if (sql.includes("FROM integrations.relay_fuel_transactions r")) return { rows: [{ id: "rf-1", amount_cents: 50000, event_date: "2026-09-10", memo: "Relay fill txn_1", reference: "txn_1", description: "Love's #762 Laredo TX" }] };
    return { rows: [] };
  });
}

describe("bank match chips return rows: transfer / je / relay_fuel (443.168 N)", () => {
  it("an operating-bank money-out line offers its transfer and its manual journal entry", async () => {
    install({ isCredit: false, register: { ledger_id: "ledger-1000", operating: true, relay_wallet: false } });
    const { candidates } = await findCandidates({ operating_company_id: CO, bank_transaction_id: "tx-1" });
    const kinds = candidates.map((c) => c.ledger_entry_kind);
    expect(kinds).toContain("transfer");
    expect(kinds).toContain("je");
    expect(kinds).not.toContain("relay_fuel");
  });

  it("the Relay Fuel Wallet money-out line offers its Relay fill", async () => {
    install({ isCredit: false, register: { ledger_id: "ledger-1295", operating: false, relay_wallet: true } });
    const { candidates } = await findCandidates({ operating_company_id: CO, bank_transaction_id: "tx-1" });
    expect(candidates.map((c) => c.ledger_entry_kind)).toContain("relay_fuel");
  });
});
