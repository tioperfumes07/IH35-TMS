import { describe, expect, it, vi } from "vitest";

/**
 * LEAD 443.192 (12:00Z) — Event 2 (bill) is dated by its invoice's issue date, never by the fire time, never before the earn.
 *
 * Before: the bill JE was dated with the caller's entry_date_iso (companyBusinessDate() at fire time) — every standing bill
 * on prod sat on 2026-10-16 while its invoice was issued 10-05..10-16. This test FAILS on the old poster ("2026-10-16").
 *
 * Pure unit test — DB, role resolver and JE writer mocked (same pattern as poster-earn-dated-by-evidence.test.ts). The
 * GREATEST(issue_date, earn date) and the closed-period cutoff are SQL; the mock answers them the way Postgres would.
 */

const { mockQuery, mockWithLuciaBypass, mockIsEnabled, mockCreateJournalEntry, mockResolveRoleAccount } = vi.hoisted(() => {
  const query = vi.fn();
  return {
    mockQuery: query,
    mockWithLuciaBypass: vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query })),
    mockIsEnabled: vi.fn(),
    mockCreateJournalEntry: vi.fn(),
    mockResolveRoleAccount: vi.fn(),
  };
});

vi.mock("../../../auth/db.js", () => ({ withLuciaBypass: mockWithLuciaBypass }));
vi.mock("../../../lib/feature-flags/service.js", () => ({ isEnabled: mockIsEnabled }));
vi.mock("../../journal-entries.service.js", () => ({ createJournalEntry: mockCreateJournalEntry }));
vi.mock("../../coa-roles/resolver.service.js", () => ({ resolveRoleAccount: mockResolveRoleAccount }));
vi.mock("../../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));
vi.mock("../../accounting-spine-emit.js", () => ({ writeTransactionSourceLink: vi.fn(async () => undefined) }));

const { postLoadRevenueLatch } = await import("../poster.service.js");

const OPCO = "11111111-1111-4111-8111-111111111111";
const LOAD_ID = "44444444-4444-4444-8444-444444444444";
const INVOICE_ID = "55555555-5555-4555-8555-555555555555";
const ACTOR = "22222222-2222-4222-8222-222222222222";
const FIRE_DAY = "2026-10-16";

function install({ billDate, closedThrough = null, invoice = true }: { billDate: string | null; closedThrough?: string | null; invoice?: boolean }) {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
    if (sql.includes("GREATEST(") && sql.includes("closed_period_cutoff")) {
      expect(values).toEqual([OPCO, LOAD_ID, INVOICE_ID]);
      return { rows: [{ bill_date: billDate, closed_through: closedThrough }] };
    }
    if (sql.includes("set_config")) return { rows: [] };
    if (sql.includes("to_regclass")) return { rows: [{ ok: true }] };
    if (sql.includes("FROM org.companies")) return { rows: [{ code: "USMCA" }] };
    if (sql.includes("SELECT p.amount_cents")) return { rows: [{ amount_cents: "250000" }] };
    if (sql.includes("status IN ('sent', 'partial', 'paid', 'factored')")) return { rows: invoice ? [{ id: INVOICE_ID }] : [] };
    if (sql.includes("FROM accounting.invoices") && sql.includes("ORDER BY created_at ASC")) return { rows: invoice ? [{ id: INVOICE_ID }] : [] };
    if (sql.includes("FROM mdata.loads")) {
      return { rows: [{ id: LOAD_ID, status: "completed_docs_received", rate_total_cents: "250000", display_id: "13655", is_sample_data: false }] };
    }
    return { rows: [] };
  });
  mockIsEnabled.mockReset().mockResolvedValue(true);
  mockResolveRoleAccount.mockReset().mockImplementation(async (_c: unknown, _o: string, role: string) => `acct-${role}`);
  mockCreateJournalEntry.mockReset().mockResolvedValue({ id: "je-1" });
}

const fire = () =>
  postLoadRevenueLatch({ operating_company_id: OPCO, load_id: LOAD_ID, target_status: "completed_docs_received", entry_date_iso: FIRE_DAY, actor_user_id: ACTOR });

function postedEntryDate(): string {
  expect(mockCreateJournalEntry).toHaveBeenCalledTimes(1);
  return (mockCreateJournalEntry.mock.calls[0]![0] as { entry_date: string }).entry_date;
}

describe("LEAD 443.192 — revrec Event 2 is dated by its invoice", () => {
  it("dates the bill on the invoice's issue date (or the earn's, whichever is later), not the day the latch fired", async () => {
    install({ billDate: "2026-10-05" });
    const r = await fire();
    expect(r.posted).toBe(true);
    expect(postedEntryDate()).toBe("2026-10-05");
  });

  it("falls back to the caller's date when that day is in a closed period", async () => {
    install({ billDate: "2026-08-28", closedThrough: "2026-08-31" });
    await fire();
    expect(postedEntryDate()).toBe(FIRE_DAY);
  });

  it("still refuses without an issued invoice (gate unchanged)", async () => {
    install({ billDate: null, invoice: false });
    const r = await fire();
    expect(r).toEqual({ posted: false, reason: "missing_issued_invoice" });
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
  });
});
