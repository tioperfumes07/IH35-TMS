/**
 * AI-1 CI Guard: Period lock DB trigger
 *
 * Two cases:
 *  1. App-layer ensureOpenPeriod() blocks when closed_period_cutoff returns a closed date.
 *  2. Raw DB trigger (trg_block_closed_period_journal_entries) raising IH35_CLOSED_PERIOD
 *     propagates even when the app-layer guard would have passed (defense-in-depth).
 */
import { describe, expect, it, vi } from "vitest";

const withCurrentUserMock = vi.fn();

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: (...args: unknown[]) => withCurrentUserMock(...args),
}));

const COMPANY_ID = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const INVOICE_ID = "aaaa0000-0000-4000-8000-000000000001";
const ACTOR_ID = "cccc0000-0000-4000-8000-000000000001";

function makeInvoiceRow(overrides?: Record<string, unknown>) {
  return {
    id: INVOICE_ID,
    status: "sent",
    issue_date: "2026-04-15",
    total_cents: 50000,
    display_id: "INV-2026-00099",
    source_load_id: null,
    ...overrides,
  };
}

describe("period lock DB trigger guard (AI-1)", () => {
  it("surfaces PERIOD_LOCKED when closed_period_cutoff blocks the posting date", async () => {
    const queryCalls: string[] = [];
    const AR_ACCOUNT = "aaaa1111-0000-4000-8000-000000000001";
    const REV_ACCOUNT = "aaaa2222-0000-4000-8000-000000000001";

    const client = {
      query: vi.fn(async (sql: string) => {
        queryCalls.push(sql.trim().slice(0, 60));
        if (sql.includes("set_config")) return { rows: [] };
        if (sql.includes("FROM accounting.posting_batches")) return { rows: [] };
        if (sql.includes("FOR UPDATE")) return { rows: [makeInvoiceRow()] }; // invoice fetch
        // Account resolution (happens in buildPostingDraft, before ensureOpenPeriod)
        if (sql.includes("FROM accounting.chart_of_accounts_roles")) {
          if (sql.includes("'ar_control'")) return { rows: [{ account_id: AR_ACCOUNT }] };
          if (sql.includes("'revenue_default'")) return { rows: [{ account_id: REV_ACCOUNT }] };
          return { rows: [] };
        }
        if (sql.includes("FROM catalogs.account_role_bindings")) return { rows: [] };
        if (sql.includes("FROM catalogs.accounts")) return { rows: [{ id: REV_ACCOUNT }] };
        if (sql.includes("JOIN catalogs.items")) return { rows: [] }; // invoice lines
        if (sql.includes("SELECT accounting.closed_period_cutoff"))
          return { rows: [{ cutoff: "2026-04-30" }] }; // April closed → PERIOD_LOCKED
        return { rows: [] };
      }),
    };

    withCurrentUserMock.mockImplementation(
      async (_userId: string, fn: (c: typeof client) => Promise<unknown>) => fn(client)
    );

    const mod = await import("../posting-engine.service.js");

    await expect(
      mod.postSourceTransaction(
        {
          operating_company_id: COMPANY_ID,
          source_transaction_type: "invoice",
          source_transaction_id: INVOICE_ID,
          posting_purpose: "initial_post",
        },
        { userId: ACTOR_ID }
      )
    ).rejects.toMatchObject({ code: "PERIOD_LOCKED" });

    // Nothing must be inserted after the period lock fires
    const hasInsert = queryCalls.some((s) => s.includes("INSERT INTO accounting.journal_entry_postings"));
    expect(hasInsert).toBe(false);
  });

  it("propagates IH35_CLOSED_PERIOD from DB trigger even when app-layer guard passes", async () => {
    // Simulates trg_block_closed_period_journal_entries firing at the DB level.
    // closed_period_cutoff returns null (app guard passes), account resolution succeeds,
    // but the INSERT raises the trigger exception — defense-in-depth path.
    const AR_ACCOUNT = "aaaa1111-0000-4000-8000-000000000001";
    const REV_ACCOUNT = "aaaa2222-0000-4000-8000-000000000001";
    const BATCH_ID = "bbbb0000-0000-4000-8000-000000000001";

    const dbTriggerError = Object.assign(
      new Error("IH35_CLOSED_PERIOD closed_through=2026-04-30 txn_date=2026-04-15"),
      { code: "P0001" }
    );

    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("set_config")) return { rows: [] };
        if (sql.includes("FROM accounting.posting_batches")) return { rows: [] };
        if (sql.includes("FOR UPDATE")) return { rows: [makeInvoiceRow()] }; // invoice fetch
        if (sql.includes("SELECT accounting.closed_period_cutoff"))
          return { rows: [{ cutoff: null }] }; // app guard passes
        // AR/revenue account resolution
        if (sql.includes("FROM accounting.chart_of_accounts_roles")) {
          if (sql.includes("'ar_control'")) return { rows: [{ account_id: AR_ACCOUNT }] };
          if (sql.includes("'revenue_default'")) return { rows: [{ account_id: REV_ACCOUNT }] };
          return { rows: [] };
        }
        if (sql.includes("FROM catalogs.account_role_bindings")) return { rows: [] };
        if (sql.includes("FROM catalogs.accounts")) return { rows: [{ id: REV_ACCOUNT }] };
        if (sql.includes("JOIN catalogs.items")) return { rows: [] }; // invoice lines
        // Posting batch INSERT succeeds
        if (sql.includes("INSERT INTO accounting.posting_batches")) return { rows: [{ id: BATCH_ID }] };
        if (sql.includes("INSERT INTO accounting.posting_batches") && sql.includes("ON CONFLICT"))
          return { rows: [{ id: BATCH_ID }] };
        // Simulate the DB trigger raising IH35_CLOSED_PERIOD on the journal_entries INSERT
        if (sql.includes("INSERT INTO accounting.journal_entries")) throw dbTriggerError;
        return { rows: [] };
      }),
    };

    withCurrentUserMock.mockImplementation(
      async (_userId: string, fn: (c: typeof client) => Promise<unknown>) => fn(client)
    );

    const mod = await import("../posting-engine.service.js");

    // The raw DB exception must not be swallowed — it must propagate to the caller
    await expect(
      mod.postSourceTransaction(
        {
          operating_company_id: COMPANY_ID,
          source_transaction_type: "invoice",
          source_transaction_id: INVOICE_ID,
          posting_purpose: "initial_post",
        },
        { userId: ACTOR_ID }
      )
    ).rejects.toThrow("IH35_CLOSED_PERIOD");

    // Verify no posting lines were written after the trigger error
    const hasPostingInsert = (client.query.mock.calls as [string][]).some(([s]) =>
      s.includes("INSERT INTO accounting.journal_entry_postings")
    );
    expect(hasPostingInsert).toBe(false);
  });
});
