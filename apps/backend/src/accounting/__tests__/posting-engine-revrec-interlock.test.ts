import { describe, expect, it, vi } from "vitest";

/**
 * ACCT-F59 — the invoice A/R poster must refuse a load-sourced invoice whose load already carries an
 * active DISP-01 revenue-recognition latch row.
 *
 * The latch posts CR Freight Revenue (Event 1) and DR A/R (Event 2); the invoice poster posts DR A/R
 * / CR income. Run both over one load and revenue AND A/R are both stated twice. On prod both flags
 * are ON for TRANSP and USMCA (verified 2026-08-01), so this is a mechanism, not a style preference.
 *
 * Pure unit test — DB + role resolver mocked (same pattern as posting-engine-cash-advance.test.ts).
 * The point is behavioural: prove it REFUSES, prove it posts NOTHING while refusing, and prove it
 * does not over-block the two adjacent cases (no latch; not load-sourced).
 */

const { mockQuery, mockWithCurrentUser, mockResolveRoleAccountOptional, mockResolveAccountForCategory } = vi.hoisted(
  () => {
    const query = vi.fn();
    return {
      mockQuery: query,
      mockWithCurrentUser: vi.fn(async (_userId: string, fn: (client: { query: typeof query }) => unknown) =>
        fn({ query })
      ),
      mockResolveRoleAccountOptional: vi.fn(),
      mockResolveAccountForCategory: vi.fn(),
    };
  }
);

vi.mock("../../auth/db.js", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, withCurrentUser: mockWithCurrentUser };
});
vi.mock("../coa-roles/resolver.service.js", () => ({ resolveRoleAccountOptional: mockResolveRoleAccountOptional }));
vi.mock("../expense-category-map/resolver.service.js", () => ({
  resolveAccountForCategory: mockResolveAccountForCategory,
}));

const { postSourceTransaction, PostingEngineError } = await import("../posting-engine.service.js");

const OPCO = "11111111-1111-4111-8111-111111111111";
const ACTOR = "22222222-2222-4222-8222-222222222222";
const INVOICE_ID = "33333333-3333-4333-8333-333333333333";
const LOAD_ID = "44444444-4444-4444-8444-444444444444";
const AR_ACCOUNT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INCOME_ACCOUNT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type Opts = {
  sourceLoadId: string | null;
  latchRows: Array<{ id: string }>;
  /**
   * ACCT-F59 SECOND ARM — the load's OWN status. The 473 ms race put duplicate revenue on prod with
   * `latchRows: []` and a delivered load: the invoice posts first in the delivery handler, so no latch
   * row exists YET. Defaults to a pre-delivery status so every pre-existing case behaves as before.
   */
  loadStatus?: string;
};

function installQueryMock({ sourceLoadId, latchRows, loadStatus = "in_transit" }: Opts) {
  const postedLines: Array<{ account_id: string; debit_or_credit: string; amount_cents: number }> = [];

  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("set_config")) return { rows: [] };
    if (sql.includes("FROM accounting.invoices")) {
      return {
        rows: [
          {
            id: INVOICE_ID,
            status: "sent",
            issue_date: "2026-07-30",
            total_cents: "150000",
            tax_cents: "0",
            display_id: "INV-TEST-1",
            source_load_id: sourceLoadId,
          },
        ],
      };
    }
    if (sql.includes("to_regclass")) return { rows: [{ ok: true }] };
    if (sql.includes("load_revenue_recognition_postings")) return { rows: latchRows };
    // ACCT-F59 second arm reads the load's own status (order-independent interlock).
    if (sql.includes("FROM mdata.loads")) return { rows: [{ status: loadStatus }] };
    if (sql.includes("FROM accounting.invoice_lines")) {
      return {
        rows: [
          {
            id: "line-1",
            line_type: "service",
            line_total_cents: "150000",
            display_order: 1,
            description: "Line haul",
            qbo_item_id: null,
            income_account_id: INCOME_ACCOUNT,
          },
        ],
      };
    }
    if (sql.includes("closed_period_cutoff")) return { rows: [{ cutoff: null }] };
    if (sql.includes("INSERT INTO accounting.posting_batches")) return { rows: [{ id: "batch-1" }] };
    if (sql.includes("INSERT INTO accounting.journal_entries")) return { rows: [{ id: "je-1" }] };
    if (sql.includes("INSERT INTO accounting.journal_entry_postings")) {
      postedLines.push({
        account_id: String(params[3]),
        debit_or_credit: String(params[4]),
        amount_cents: Number(params[5]),
      });
      return { rows: [{ id: `jep-${postedLines.length}` }] };
    }
    if (sql.includes("batch_status")) return { rows: [] };
    return { rows: [] };
  });

  return { postedLines };
}

function post() {
  return postSourceTransaction(
    {
      operating_company_id: OPCO,
      source_transaction_type: "invoice",
      source_transaction_id: INVOICE_ID,
    },
    { userId: ACTOR }
  );
}

describe("posting-engine invoice ↔ revrec latch interlock (ACCT-F59)", () => {
  it("REFUSES a load-sourced invoice whose load already carries an active latch row, and posts nothing", async () => {
    mockResolveRoleAccountOptional.mockReset();
    mockResolveRoleAccountOptional.mockResolvedValue(AR_ACCOUNT);
    const { postedLines } = installQueryMock({ sourceLoadId: LOAD_ID, latchRows: [{ id: "latch-1" }] });

    await expect(post()).rejects.toMatchObject({ code: "INVOICE_REVREC_LATCH_OWNS_LOAD" });
    await expect(post()).rejects.toBeInstanceOf(PostingEngineError);

    // The whole point: refusing must mean NOTHING hit the ledger — not a partial or AR-only entry.
    expect(postedLines).toHaveLength(0);
  });

  it("names the load in the refusal so the exception is actionable", async () => {
    mockResolveRoleAccountOptional.mockReset();
    mockResolveRoleAccountOptional.mockResolvedValue(AR_ACCOUNT);
    installQueryMock({ sourceLoadId: LOAD_ID, latchRows: [{ id: "latch-1" }] });

    await expect(post()).rejects.toThrow(new RegExp(LOAD_ID));
  });

  // ── ACCT-F59 SECOND ARM — the 473 ms race that actually put duplicate revenue on prod ──────────
  //
  // THE DEFECT THESE PIN. On the delivery transition the invoice posts FIRST and the latch SECOND,
  // inside one handler. Measured on prod, load L-20260806-0008: invoice JE 07:14:33.413711, latch earn
  // JE 07:14:33.886651 — 473 ms apart, and `4000 Freight/Line-haul Income` was credited TWICE for the
  // same $1,875.50. Every test above passes in that scenario, because at the instant the invoice posts
  // there is genuinely NO latch row: `latchRows: []`. The first arm asks about the past; only asking
  // about the LOAD'S OWN STATE catches it.
  it.each(["delivered_pending_docs", "completed_docs_received"])(
    "REFUSES when the load has reached delivery evidence (%s) even though NO latch row exists yet — the prod race",
    async (loadStatus) => {
      mockResolveRoleAccountOptional.mockReset();
      mockResolveRoleAccountOptional.mockResolvedValue(AR_ACCOUNT);
      const { postedLines } = installQueryMock({ sourceLoadId: LOAD_ID, latchRows: [], loadStatus });

      await expect(post()).rejects.toMatchObject({ code: "INVOICE_REVREC_LATCH_OWNS_LOAD" });
      // Same absolute rule as the first arm: refusing means NOTHING hit the ledger.
      expect(postedLines).toHaveLength(0);
    }
  );

  it("explains the ordering in the refusal, so the next reader is not sent hunting for a latch row", async () => {
    mockResolveRoleAccountOptional.mockReset();
    mockResolveRoleAccountOptional.mockResolvedValue(AR_ACCOUNT);
    installQueryMock({ sourceLoadId: LOAD_ID, latchRows: [], loadStatus: "delivered_pending_docs" });

    await expect(post()).rejects.toThrow(/REACHED DELIVERY EVIDENCE/);
    await expect(post()).rejects.toThrow(new RegExp(LOAD_ID));
  });

  it("does NOT over-block a delivered load that is not load-sourced (no source_load_id)", async () => {
    mockResolveRoleAccountOptional.mockReset();
    mockResolveRoleAccountOptional.mockResolvedValue(AR_ACCOUNT);
    // A manual invoice never has a latch, so it must keep crediting income directly even if some
    // unrelated load happens to be delivered.
    const { postedLines } = installQueryMock({
      sourceLoadId: null,
      latchRows: [],
      loadStatus: "completed_docs_received",
    });

    const result = await post();
    expect(result.result).toBe("posted");
    expect(postedLines.filter((l) => l.debit_or_credit === "credit").map((l) => l.account_id)).toEqual([
      INCOME_ACCOUNT,
    ]);
  });

  it("POSTS normally when the load has no active latch row (no over-blocking)", async () => {
    mockResolveRoleAccountOptional.mockReset();
    mockResolveRoleAccountOptional.mockResolvedValue(AR_ACCOUNT);
    const { postedLines } = installQueryMock({ sourceLoadId: LOAD_ID, latchRows: [] });

    const result = await post();
    expect(result.result).toBe("posted");

    const debits = postedLines.filter((l) => l.debit_or_credit === "debit");
    const credits = postedLines.filter((l) => l.debit_or_credit === "credit");
    expect(debits.map((l) => l.account_id)).toEqual([AR_ACCOUNT]);
    expect(credits.map((l) => l.account_id)).toEqual([INCOME_ACCOUNT]);
    // Balanced by construction.
    expect(debits.reduce((s, l) => s + l.amount_cents, 0)).toBe(credits.reduce((s, l) => s + l.amount_cents, 0));
  });

  it("POSTS a non-load-sourced invoice even while latch rows exist — the gate is source_load_id", async () => {
    mockResolveRoleAccountOptional.mockReset();
    mockResolveRoleAccountOptional.mockResolvedValue(AR_ACCOUNT);
    const { postedLines } = installQueryMock({ sourceLoadId: null, latchRows: [{ id: "latch-1" }] });

    const result = await post();
    expect(result.result).toBe("posted");
    expect(postedLines.length).toBeGreaterThan(0);
  });
});
