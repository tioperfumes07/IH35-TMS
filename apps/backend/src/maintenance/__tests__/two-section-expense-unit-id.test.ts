/**
 * Law §9 regression: autoCreateExpenseFromWO must stamp unit_id (and preserve vendor)
 * on accounting.expenses when the WO header has a unit.
 */

import { describe, expect, it, vi } from "vitest";

const { mockAudit } = vi.hoisted(() => ({
  mockAudit: vi.fn(),
}));

vi.mock("../../bills/bill-line-account-resolution.service.js", () => ({
  resolveBillLineAccountId: vi.fn(),
}));
vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: mockAudit,
}));

import { autoCreateExpenseFromWO } from "../two-section-service.js";

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
            total_amount: 100,
          },
        ],
      };
    }
    if (sql.includes("FROM maintenance.work_order_lines") && sql.includes("requires_load")) {
      return { rows: [{ requires_load: false }] };
    }
    if (sql.includes("INSERT INTO accounting.expenses")) return { rows: [{ id: "exp-1" }] };
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
    expect(expenseInsert!.params).toEqual(
      expect.arrayContaining(["oc-1", "vendor-1", "wo-1", "unit-1", 100])
    );
  });
});
