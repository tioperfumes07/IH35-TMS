/**
 * Law §9 regression: autoCreateExpenseFromWO must stamp unit_id (and preserve vendor)
 * on accounting.expenses when the WO header has a unit.
 */

import { describe, expect, it, vi } from "vitest";

const { mockAudit, mockIsEnabled, mockPostInClientTx } = vi.hoisted(() => ({
  mockAudit: vi.fn(),
  mockIsEnabled: vi.fn(),
  mockPostInClientTx: vi.fn(),
}));

vi.mock("../../bills/bill-line-account-resolution.service.js", () => ({
  resolveBillLineAccountId: vi.fn(),
}));
vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: mockAudit,
}));
vi.mock("../../lib/feature-flags/service.js", () => ({
  isEnabled: mockIsEnabled,
}));
vi.mock("../../accounting/posting-engine.service.js", () => ({
  postSourceTransactionInClientTx: mockPostInClientTx,
  PostingEngineError: class PostingEngineError extends Error {},
}));

import { autoCreateExpenseFromWO } from "../two-section-service.js";
import { PostingEngineError } from "../../accounting/posting-engine.service.js";

function makeClient(opts?: { hasUnitId?: boolean; hasLoadId?: boolean }) {
  const hasUnitId = opts?.hasUnitId !== false;
  const hasLoadId = opts?.hasLoadId !== false;
  const calls: { sql: string; params?: unknown[] }[] = [];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    if (sql.includes("to_regclass")) {
      // relationExists for accounting.expenses / expense_lines / catalogs.qbo_categories
      if (sql.includes("$1") && params?.[0] === "catalogs.qbo_categories") return { rows: [{ ok: false }] };
      return { rows: [{ ok: true }] };
    }
    if (sql.includes("information_schema.columns") && sql.includes("column_name")) {
      const col = String(params?.[2] ?? "");
      if (col === "unit_id") return { rows: hasUnitId ? [{ ok: true }] : [] };
      if (col === "load_id") return { rows: hasLoadId ? [{ ok: true }] : [] };
      return { rows: [] };
    }
    if (sql.includes("FROM maintenance.work_orders")) {
      return {
        rows: [
          {
            operating_company_id: "oc-1",
            vendor_uuid: "vendor-1",
            unit_id: "unit-1",
            load_id: null,
            total_amount_cents: 100,
          },
        ],
      };
    }
    if (sql.includes("FROM maintenance.work_order_lines") && sql.includes("requires_load")) {
      return { rows: [{ requires_load: false }] };
    }
    if (sql.includes("INSERT INTO accounting.expenses")) return { rows: [{ id: "exp-1" }] };
    if (sql.includes("UPDATE accounting.expenses")) return { rows: [] };
    if (sql.includes("FROM maintenance.work_order_lines")) return { rows: [] };
    return { rows: [] };
  });
  return { client: { query } as never, calls };
}

describe("autoCreateExpenseFromWO — unit_id stamp (Law §9)", () => {
  it("inserts unit_id + vendor_uuid from the work order onto accounting.expenses", async () => {
    mockAudit.mockResolvedValue(undefined);
    const { client, calls } = makeClient();

    const res = await autoCreateExpenseFromWO(client, "user-1", "wo-1", null, null);
    expect(res).toEqual({ uuid: "exp-1" });

    const expenseInsert = calls.find((c) => c.sql.includes("INSERT INTO accounting.expenses"));
    expect(expenseInsert, "expenses INSERT must run").toBeTruthy();
    expect(expenseInsert!.sql).toMatch(/\bunit_id\b/);
    expect(expenseInsert!.sql).toMatch(/\bvendor_uuid\b/);
    expect(expenseInsert!.sql).toMatch(/\btotal_amount_cents\b/);
    expect(expenseInsert!.params).toEqual(
      expect.arrayContaining(["oc-1", "vendor-1", "wo-1", "unit-1", 100])
    );
  });

  // ACT-F5413/ACT-F5414 regression: created_by_user_id must be stamped, and the column this writer
  // targets must be the real total_amount_cents (accounting.expenses has no "total_amount" column).
  it("stamps created_by_user_id and targets total_amount_cents (not the non-existent total_amount)", async () => {
    mockAudit.mockResolvedValue(undefined);
    const { client, calls } = makeClient();

    await autoCreateExpenseFromWO(client, "user-1", "wo-1", null, null);

    const expenseInsert = calls.find((c) => c.sql.includes("INSERT INTO accounting.expenses"));
    expect(expenseInsert, "expenses INSERT must run").toBeTruthy();
    expect(expenseInsert!.sql).toMatch(/\bcreated_by_user_id\b/);
    expect(expenseInsert!.sql).not.toMatch(/[^_]\btotal_amount\b(?!_cents)/);
    expect(expenseInsert!.params).toContain("user-1");
  });

  // MAINT-F5697-CLASS — a "paid same day" WO expense used to stop at the INSERT: real, status=
  // 'posted' (document lifecycle), but never actually reached the GL. Reuses the canonical POST
  // /api/v1/expenses route's own gate (EXPENSE_GL_POSTING_ENABLED -> postSourceTransactionInClientTx),
  // in the caller's own open transaction (not postSourceTransaction's separate connection, which hit
  // the identical READ-COMMITTED visibility bug for the revenue latch this same session).
  describe("MAINT-F5697-CLASS — GL posting on paid_same_day WO expenses", () => {
    it("posts to GL when a payment account is given and the flag is ON", async () => {
      mockAudit.mockResolvedValue(undefined);
      mockIsEnabled.mockResolvedValue(true);
      mockPostInClientTx.mockResolvedValue({ journal_entry_id: "je-1" });
      const { client, calls } = makeClient();

      const res = await autoCreateExpenseFromWO(client, "user-1", "wo-1", "payment-acct-1", null);
      expect(res).toEqual({ uuid: "exp-1" });

      expect(mockIsEnabled).toHaveBeenCalledWith(
        client,
        "EXPENSE_GL_POSTING_ENABLED",
        expect.objectContaining({ operating_company_id: "oc-1" })
      );
      expect(mockPostInClientTx).toHaveBeenCalledWith(
        client,
        expect.objectContaining({
          operating_company_id: "oc-1",
          source_transaction_type: "expense",
          source_transaction_id: "exp-1",
        }),
        expect.objectContaining({ userId: "user-1" })
      );
      const update = calls.find((c) => c.sql.includes("UPDATE accounting.expenses") && c.sql.includes("posting_status"));
      expect(update, "posting_status UPDATE must run").toBeTruthy();
      expect(update!.sql).toMatch(/posting_status\s*=\s*'posted'/);
      expect(update!.params).toEqual(expect.arrayContaining(["exp-1", "je-1", "oc-1"]));
    });

    it("does NOT attempt GL posting when no payment account was given (in_house/vendor_invoice callers pass null)", async () => {
      mockAudit.mockResolvedValue(undefined);
      mockIsEnabled.mockClear();
      mockPostInClientTx.mockClear();
      const { client } = makeClient();

      await autoCreateExpenseFromWO(client, "user-1", "wo-1", null, null);

      expect(mockIsEnabled).not.toHaveBeenCalled();
      expect(mockPostInClientTx).not.toHaveBeenCalled();
    });

    it("does NOT post when the flag is OFF, but still returns the expense uuid", async () => {
      mockAudit.mockResolvedValue(undefined);
      mockIsEnabled.mockResolvedValue(false);
      mockPostInClientTx.mockClear();
      const { client } = makeClient();

      const res = await autoCreateExpenseFromWO(client, "user-1", "wo-1", "payment-acct-1", null);
      expect(res).toEqual({ uuid: "exp-1" });
      expect(mockPostInClientTx).not.toHaveBeenCalled();
    });

    it("swallows a PostingEngineError (non-fatal, matches the canonical route's contract) and still returns the expense uuid", async () => {
      mockAudit.mockResolvedValue(undefined);
      mockIsEnabled.mockResolvedValue(true);
      mockPostInClientTx.mockRejectedValue(new PostingEngineError("ACCOUNT_MAPPING_MISSING"));
      const { client } = makeClient();

      const res = await autoCreateExpenseFromWO(client, "user-1", "wo-1", "payment-acct-1", null);
      expect(res).toEqual({ uuid: "exp-1" });
    });

    it("does NOT swallow a non-PostingEngineError (a real bug must still surface)", async () => {
      mockAudit.mockResolvedValue(undefined);
      mockIsEnabled.mockResolvedValue(true);
      mockPostInClientTx.mockRejectedValue(new Error("unexpected_db_error"));
      const { client } = makeClient();

      await expect(autoCreateExpenseFromWO(client, "user-1", "wo-1", "payment-acct-1", null)).rejects.toThrow(
        "unexpected_db_error"
      );
    });
  });
});
