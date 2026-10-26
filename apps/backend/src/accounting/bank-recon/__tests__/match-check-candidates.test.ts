import { beforeEach, describe, expect, it, vi } from "vitest";
import { findCandidates, PERSISTABLE_MATCH_KINDS } from "../match.service.js";
import { bankMatchFilterKindSchema, bankMatchAcceptKindSchema } from "../match-api-kinds.js";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../../auth/db.js", () => ({
  withLuciaBypass: async (fn: (client: { query: typeof query }) => unknown) => fn({ query }),
}));
const company = "5c854333-6ea5-4faa-af31-67cb272fef80";

describe("Checks filter preserves canonical match identities", () => {
  beforeEach(() => {
    query.mockReset();
    query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM banking.bank_accounts ba")) return { rows: [{ ledger_id: "ledger", operating: true, relay_wallet: false, card: false }] };
      if (sql.includes("WHERE bt.id = $1::uuid")) return { rows: [{ id: "bank-line", bank_account_id: "bank", operating_company_id: company,
        transaction_date: "2026-10-20", amount_cents: 25000, is_credit: false, description: "Check 1234", review_state: "for_review" }] };
      if (sql.includes("FROM accounting.expenses e")) return { rows: [{ id: "expense-check", amount_cents: 25000, event_date: "2026-10-20", memo: "1234", reference: "1234" }] };
      if (sql.includes("FROM accounting.bill_payments bp")) return { rows: [{ id: "bill-payment-check", amount_cents: 25000, event_date: "2026-10-20", memo: "1235", reference: "1235" }] };
      return { rows: [] };
    });
  });

  it("accepts Checks as a filter, not a new persisted document kind", () => {
    expect(bankMatchFilterKindSchema.parse("check")).toBe("check");
    expect(bankMatchAcceptKindSchema.safeParse("check").success).toBe(false);
  });

  it("offers posted check documents through existing matchable identities without writing", async () => {
    const { candidates } = await findCandidates({ operating_company_id: company, bank_transaction_id: "bank-line", kinds: ["check"] });
    expect(candidates.map(c => c.ledger_entry_kind).sort()).toEqual(["bill_payment", "expense"]);
    for (const c of candidates) expect(PERSISTABLE_MATCH_KINDS.has(c.ledger_entry_kind)).toBe(true);
    const expenseCall = query.mock.calls.find(([sql]) => sql.includes("FROM accounting.expenses e"));
    expect(expenseCall?.[0]).toContain("e.posting_status = 'posted'");
    expect(expenseCall?.[0]).not.toContain("e.status = 'posted'");
    expect(expenseCall?.[0]).toContain("e.payment_type = 'check'");
    expect(expenseCall?.[0]).toContain("e.check_number");
    expect(expenseCall?.[1]?.[6]).toBe(false);
    const billCall = query.mock.calls.find(([sql]) => sql.includes("FROM accounting.bill_payments bp"));
    expect(billCall?.[0]).toContain("upper(bp.payment_method) = 'CHECK'");
    expect(billCall?.[1]?.[7]).toBe(false);
    expect(query.mock.calls.some(([sql]) => /\b(INSERT|UPDATE|DELETE)\b/.test(sql))).toBe(false);
  });

  it("keeps expense/check union a single expense query, without duplicate candidates", async () => {
    const { candidates } = await findCandidates({ operating_company_id: company, bank_transaction_id: "bank-line", kinds: ["expense", "check"] });
    expect(candidates.filter(c => c.ledger_entry_id === "expense-check")).toHaveLength(1);
    const call = query.mock.calls.find(([sql]) => sql.includes("FROM accounting.expenses e"));
    expect(call?.[1]?.[6]).toBe(true);
  });
});
