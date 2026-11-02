import { describe, expect, it, vi } from "vitest";
import { acceptExactMultiDocumentMatch } from "../match.service.js";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../../auth/db.js", () => ({ withLuciaBypass: async (fn: (client: unknown) => unknown) => fn({ query }) }));

const company = "11111111-1111-4111-8111-111111111111";
const bankLine = "22222222-2222-4222-8222-222222222222";
const expenses = ["33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444"];
const input = { operating_company_id: company, bank_transaction_id: bankLine,
  actor_user_uuid: "55555555-5555-4555-8555-555555555555", card_discount: true,
  entries: expenses.map(id => ({ ledger_entry_kind: "expense" as const, ledger_entry_id: id })) };

function fixture(bankAmount = 9700, closed = false) {
  query.mockReset();
  let posting = 0;
  query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("FROM banking.bank_transactions") && sql.includes("transaction_date")) return { rows: [{ id: bankLine, bank_account_id: "bank", operating_company_id: company, transaction_date: "2026-10-27", amount_cents: bankAmount, is_credit: false, review_state: "for_review" }] };
    if (sql.includes("SELECT posting_status::text")) return { rows: [{ posting_status: "posted" }] };
    if (sql.includes("SELECT total_amount_cents::int AS amount_cents")) return { rows: [{ amount_cents: params[0] === expenses[0] ? 6000 : 4000 }] };
    if (sql.includes("FROM catalogs.items i")) return { rows: [{ id: "discount-item", account_id: "fuel-account" }] };
    if (sql.includes("SELECT e.id::text, e.expense_number AS ref")) return { rows: expenses.map((id, i) => ({ id, class_id: `unit-class-${i}`, ref: `EX-${i}` })) };
    if (sql.includes("FROM banking.bank_accounts")) return { rows: [{ ledger_account_id: "card-payable" }] };
    if (sql.includes("SELECT true AS ok FROM catalogs.accounts")) return { rows: [{ ok: true }] };
    if (sql.includes("closed_period_cutoff")) return { rows: [{ cutoff: closed ? "2026-10-31" : null }] };
    if (sql.includes("INSERT INTO accounting.journal_entries")) return { rows: [{ id: "variance-je" }] };
    if (sql.includes("SELECT entry_date::text FROM accounting.journal_entries")) return { rows: [{ entry_date: "2026-10-27" }] };
    if (sql.includes("FROM catalogs.accounts WHERE id = ANY")) return { rows: (params[0] as string[]).map(id => ({ id, is_postable: true })) };
    if (sql.includes("SELECT COALESCE(vendor_uuid::text")) return { rows: [{ e: "fuel-vendor", t: "vendor" }] };
    if (sql.includes("INSERT INTO accounting.journal_entry_postings")) return { rows: [{ id: `posting-${++posting}` }] };
    if (sql.includes("INSERT INTO banking.reconciliation_matches")) return { rows: [{ id: `match-${params[3]}` }] };
    return { rows: [], rowCount: 1 };
  });
}

describe("ENG-28 real bank card split caller through complete posting engine", () => {
  it("posts both receipt pairs with exact signs, amounts, source IDs, classes and bank spine", async () => {
    fixture();
    await acceptExactMultiDocumentMatch(input);
    const postings = query.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO accounting.journal_entry_postings")).map(([, params]) => params as unknown[]);
    expect(postings.map(p => [p[3], p[4], p[5], p[7], p[8], p[12]])).toEqual([
      ["card-payable", "debit", 180, "expense", expenses[0], "unit-class-0"],
      ["fuel-account", "credit", 180, "expense", expenses[0], "unit-class-0"],
      ["card-payable", "debit", 120, "expense", expenses[1], "unit-class-1"],
      ["fuel-account", "credit", 120, "expense", expenses[1], "unit-class-1"],
    ]);
    expect(new Set(postings.map(p => p[11])).size).toBe(4);
    const links = query.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO accounting.transaction_source_links")).map(([, params]) => params as unknown[]);
    expect(links).toHaveLength(4);
    for (const link of links) expect([link[0], ...link.slice(2)]).toEqual([company, "bank_transaction", bankLine, "bank_reconciliation_variance"]);
  });
  it("refuses the opposite variance sign rather than inventing discount accounting", async () => {
    fixture(10300);
    await expect(acceptExactMultiDocumentMatch(input)).rejects.toThrow("card_line_above_receipt");
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO accounting.journal_entry_postings"))).toBe(false);
  });
  it("refuses a closed period before any posting insert", async () => {
    fixture(9700, true);
    await expect(acceptExactMultiDocumentMatch(input)).rejects.toThrow("closed_through");
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO accounting.journal_entry_postings"))).toBe(false);
  });
});
