/**
 * Regression guard for the BILL branch of the shared copyToAccountingLines
 * (apps/backend/src/maintenance/two-section-service.ts).
 *
 * GAP-EXPENSES Phase 1.5 changed the EXPENSE branch only (cents source of truth +
 * synchronized `amount` + parent total_amount_cents reconciliation). copyToAccountingLines
 * is shared with the bill path (autoCreateBillFromWO -> "accounting.bill_lines"). This test
 * drives the real bill path with a mock client and proves the bill write is unchanged:
 *   - writes accounting.bill_lines with the dollar `amount` column, NOT amount_cents
 *   - keeps its account-resolution columns (category_kind/category_code/account_id)
 *   - the Phase-1.5 expense-only additions (total_amount_cents reconciliation; expense_lines
 *     INSERT) do NOT run on the bill path
 * So a future writer regression that leaks the cents treatment into bills is caught here.
 */

import { describe, expect, it, vi } from "vitest";

const { mockResolve, mockAudit } = vi.hoisted(() => ({
  mockResolve: vi.fn(),
  mockAudit: vi.fn(),
}));

vi.mock("../../bills/bill-line-account-resolution.service.js", () => ({
  resolveBillLineAccountId: mockResolve,
}));
vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: mockAudit,
}));

import { autoCreateBillFromWO } from "../two-section-service.js";

function makeClient() {
  const calls: { sql: string; params?: unknown[] }[] = [];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    if (sql.includes("to_regclass")) return { rows: [{ ok: true }] };
    if (sql.includes("INSERT INTO accounting.bills")) return { rows: [{ id: "bill-1" }] };
    if (sql.includes("FROM maintenance.work_orders")) return { rows: [{ operating_company_id: "oc-1" }] };
    if (sql.includes("FROM maintenance.work_order_lines")) {
      return {
        rows: [
          {
            id: "wol-1",
            line_type: "part",
            description: "Brake pad",
            quantity: 2,
            unit_cost: 25,
            amount: 50, // dollars (total_cost AS amount)
            section: "B",
            parent_line_uuid: null,
            expense_category_uuid: "cat-1",
            service_item_uuid: null,
            part_uuid: "part-1",
            labor_rate_uuid: null,
            part_location_codes: null,
          },
        ],
      };
    }
    if (sql.includes("INSERT INTO accounting.bill_lines")) return { rows: [{ id: "bl-1" }] };
    return { rows: [] };
  });
  return { client: { query } as never, calls };
}

describe("autoCreateBillFromWO — bill_lines write (Phase 1.5 bill-branch regression guard)", () => {
  it("writes accounting.bill_lines in dollars (no amount_cents) and runs no expense-side reconciliation", async () => {
    mockResolve.mockResolvedValue({ category_kind: "maintenance", category_code: "PART", account_id: "acct-1" });
    mockAudit.mockResolvedValue(undefined);
    const { client, calls } = makeClient();

    const res = await autoCreateBillFromWO(client, "user-1", "wo-1");
    expect(res, "bill should be created (relationExists mocked true)").not.toBeNull();

    const billLineInsert = calls.find((c) => c.sql.includes("INSERT INTO accounting.bill_lines"));
    expect(billLineInsert, "bill_lines INSERT must run").toBeTruthy();

    // Bill branch writes the dollar `amount` column and NOT the Phase-1.5 cents column.
    expect(billLineInsert!.sql).toMatch(/\bamount\b/);
    expect(billLineInsert!.sql).not.toMatch(/amount_cents/);
    // Bill-specific account-resolution columns preserved.
    expect(billLineInsert!.sql).toMatch(/account_id/);
    // The dollar amount value (asNumber(amount) = 50) is bound, not a cents value.
    expect(billLineInsert!.params).toContain(50);

    // Phase-1.5 expense-only additions must NOT touch the bill path.
    const expenseTotalUpdate = calls.find(
      (c) => c.sql.includes("UPDATE accounting.expenses") && c.sql.includes("total_amount_cents")
    );
    expect(expenseTotalUpdate, "expense total reconciliation must NOT run for bills").toBeFalsy();

    const expenseLineInsert = calls.find((c) => c.sql.includes("INSERT INTO accounting.expense_lines"));
    expect(expenseLineInsert, "no expense_lines INSERT on the bill path").toBeFalsy();
  });
});
