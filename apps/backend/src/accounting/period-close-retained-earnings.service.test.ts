import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";

const mocks = vi.hoisted(() => ({ audit: vi.fn(), role: vi.fn() }));
vi.mock("../audit/crud-audit.js", () => ({ appendCrudAudit: mocks.audit }));
vi.mock("./coa-roles/resolver.service.js", async (original) => ({
  ...await original<Record<string, unknown>>(), resolveRoleAccountOptional: mocks.role,
}));
vi.mock("./journal-entry-type-resolver.js", () => ({
  hasJournalEntryTypeColumn: async () => true, resolveJournalEntryTypeId: async () => "adjusting-type",
}));
// Deliberately do not mock posting-engine: this caller must traverse its real batch validation and spine writer.
import { insertRetainedEarningsClosingJournalIfNeeded as close } from "./period-close-retained-earnings.service.js";

const params = { operating_company_id: "company", period_start: "2026-12-01", period_end: "2026-12-31", fiscal_year: 2026, closer_user_id: "actor" };
type Aggregate = { account_id: string; account_type: string; debits: string; credits: string };
const profit: Aggregate[] = [
  { account_id: "income", account_type: "Income", debits: "100", credits: "10100" },
  { account_id: "expense", account_type: "Expense", debits: "4500", credits: "500" },
  { account_id: "asset", account_type: "Bank", debits: "999999", credits: "0" },
];
function fixture(options: { rows?: Aggregate[]; prior?: Array<{ id: string; status: string; reversed: boolean }>; header?: string | null; cutoff?: string; invalidAccount?: boolean } = {}) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const postings: unknown[][] = [];
  const links: unknown[][] = [];
  const client = { query: vi.fn(async (sql: string, values: unknown[] = []) => {
    calls.push({ sql, values });
    if (sql.includes("SELECT DISTINCT je.id::text")) return { rows: options.prior ?? [] };
    if (sql.includes("SUM(CASE WHEN jep.debit_or_credit")) return { rows: options.rows ?? profit };
    if (sql.includes("INSERT INTO accounting.journal_entries")) return { rows: [{ id: "closing-je" }] };
    if (sql.includes("SELECT entry_date::text FROM accounting.journal_entries")) return { rows: options.header === null ? [] : [{ entry_date: options.header ?? params.period_end }] };
    if (sql.includes("SELECT * FROM accounting.journal_entry_postings")) return { rows: [] };
    if (sql.includes("closed_period_cutoff")) return { rows: [{ cutoff: options.cutoff ?? null }] };
    if (sql.includes("FROM catalogs.accounts WHERE id = ANY")) return { rows: options.invalidAccount ? [] : (values[0] as string[]).map(id => ({ id, is_postable: true })) };
    if (sql.includes("account_name LIKE 'Due to / from %'")) return { rows: [] };
    if (sql.includes("INSERT INTO accounting.journal_entry_postings")) { postings.push(values); return { rows: [{ id: `posting-${postings.length}` }] }; }
    if (sql.includes("INSERT INTO accounting.transaction_source_links")) { links.push(values); return { rows: [] }; }
    if (/^(SAVEPOINT|RELEASE SAVEPOINT|ROLLBACK TO SAVEPOINT)/.test(sql)) return { rows: [] };
    throw new Error(`Unexpected fixture query: ${sql}`);
  }) };
  return { client: client as unknown as PoolClient, calls, postings, links };
}

describe("retained earnings caller through the real validated posting batch", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.role.mockResolvedValue("retained-earnings"); });
  it("preserves fiscal-year sweep accounts, signs, cents, source roles, and deterministic key", async () => {
    const f = fixture();
    expect(await close(f.client, params)).toBe("closing-je");
    expect(f.calls.find(c => c.sql.includes("SUM(CASE"))?.values).toEqual(["company", "2026-01-01", "2026-12-31"]);
    expect(mocks.role).toHaveBeenCalledWith(f.client, "company", "retained_earnings");
    expect(f.postings.map(p => p.slice(2, 6))).toEqual([[1, "income", "debit", 10000], [2, "expense", "credit", 4000], [3, "retained-earnings", "credit", 6000]]);
    for (const p of f.postings) {
      expect(p.slice(0, 2)).toEqual(["company", "closing-je"]);
      expect(p.slice(7, 12)).toEqual(["period_close", "FY2026", null, null, "period_close:FY2026:2026-12-31"]);
    }
    expect(f.links).toEqual([1, 2, 3].map(n => ["company", `posting-${n}`, "period_close", "FY2026", "period_close"]));
    expect(mocks.audit).toHaveBeenCalledOnce();
  });
  it("debits retained earnings for a loss, including COGS and OtherIncome/OtherExpense", async () => {
    const f = fixture({ rows: [
      { account_id: "other-income", account_type: "OtherIncome", debits: "0", credits: "2000" },
      { account_id: "cogs", account_type: "CostOfGoodsSold", debits: "7000", credits: "0" },
      { account_id: "other-expense", account_type: "OtherExpense", debits: "1000", credits: "0" },
    ] });
    await close(f.client, params);
    expect(f.postings.map(p => p.slice(3, 6))).toEqual([["other-income", "debit", 2000], ["cogs", "credit", 7000], ["other-expense", "credit", 1000], ["retained-earnings", "debit", 6000]]);
  });
  it("does nothing before year end", async () => {
    const f = fixture(); expect(await close(f.client, { ...params, period_end: "2026-11-30" })).toBeNull(); expect(f.calls).toHaveLength(0);
  });
  it("does nothing with no P&L balance", async () => {
    const f = fixture({ rows: [] }); expect(await close(f.client, params)).toBeNull(); expect(f.postings).toHaveLength(0); expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("returns a prior live close without another header or posting", async () => {
    const f = fixture({ prior: [{ id: "prior-close", status: "posted", reversed: false }] });
    expect(await close(f.client, params)).toBe("prior-close"); expect(f.calls).toHaveLength(1); expect(f.postings).toHaveLength(0);
  });
  it("uses a reversal-count key after undo, never the reversed close key", async () => {
    const f = fixture({ prior: [{ id: "reversed-close", status: "posted", reversed: true }] });
    await close(f.client, params); expect(f.postings.every(p => p[11] === "period_close:FY2026:2026-12-31:r1")).toBe(true);
  });
  it.each([
    [{ header: null }, "posting_batch_header_missing_or_cross_company"],
    [{ header: "invalid" }, "posting_batch_header_date_invalid"],
    [{ cutoff: "2026-12-31" }, "IH35_CLOSED_PERIOD"],
    [{ invalidAccount: true }, "posting_batch_account_missing_inactive_nonpostable_or_cross_company"],
  ] as const)("fails engine validation without a line or spine insert: %j", async (options, error) => {
    const f = fixture(options);
    await expect(close(f.client, params)).rejects.toThrow(error);
    expect(f.postings).toHaveLength(0); expect(f.links).toHaveLength(0); expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("refuses an unsafe amount in the actual batch before any posting", async () => {
    const f = fixture({ rows: [{ account_id: "income", account_type: "Income", credits: "9007199254740992", debits: "0" }] });
    await expect(close(f.client, params)).rejects.toThrow("posting_batch_invalid_amount_or_sequence");
    expect(f.postings).toHaveLength(0); expect(f.links).toHaveLength(0);
  });
});
