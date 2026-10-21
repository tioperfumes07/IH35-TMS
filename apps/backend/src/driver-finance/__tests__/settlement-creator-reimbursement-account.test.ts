import { describe, expect, it, vi } from "vitest";
vi.mock("../../accounting/coa-roles/resolver.service.js", () => ({
  resolveRoleAccountOptional: vi.fn(async (_c, _o, role) => role),
}));
import { previewSettlementCreator } from "../settlement-creator.service.js";
import type { SettlementCreatorDraft } from "../settlement-creator.types.js";

describe("explicit reimbursement account follows the native item", () => {
  it("previews DEF on its mapped account, not the generic reimbursement role (fails old)", async () => {
    const query = vi.fn(async (sql: string, values: unknown[] = []) => {
      if (sql.includes("FROM catalogs.items") && sql.includes("default_expense_account_id")) return { rows: [{ id: "item", item_name: "DEF", default_expense_account_id: "mapped" }] };
      if (sql.includes("FROM catalogs.accounts")) {
        const id = sql.includes("id = $2") ? values[1] : values[0];
        return { rows: [{ id, account_number: id === "mapped" ? "5000" : "other", account_name: String(id) }] };
      }
      return { rows: [] };
    });
    const draft = { operating_company_id: "company", settlement_no: "5900", driver_id: "driver",
      period_start: "2026-10-01", period_end: "2026-10-02", loads: [], fuel_purchases: [],
      expenses: [], deductions: [], escrow: [], advances: [], reimbursements: [{ item_id: "item", description: "DEF", amount_cents: 2000 }],
      confirmed_zero_fuel_purchases: true } as unknown as SettlementCreatorDraft;
    const result = await previewSettlementCreator({ query } as never, draft);
    expect(result.je_lines.find(l => l.section === "reimbursement" && l.debit_cents === 2000)?.account_number).toBe("5000");
  });
});
