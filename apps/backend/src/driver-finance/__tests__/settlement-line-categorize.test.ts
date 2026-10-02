import { describe, expect, it, vi } from "vitest";
import { categorizeSettlementLines, settlementLineCategory, settlementLineItemId } from "../settlement-line-categorize.service.js";
import { USMCA_COMPANY_ID } from "../../catalogs/settlement-pdf-item-map.js";

vi.mock("../settlement-lines-materialize.service.js", () => ({
  backfillExistingSettlementLineAccounts: vi.fn(async () => ({ totalUpdated: 0 })),
}));

describe("queue item 10 (G-05) — settlement-line categorization", () => {
  it("category comes from the source row's own type, else the line type's PDF section", () => {
    expect(settlementLineCategory({ line_type: "reimbursement", reimbursement_type: "scale" })).toBe("scale");
    expect(settlementLineCategory({ line_type: "deduction", deduction_type: "fuel_advance" })).toBe("fuel_advance");
    expect(settlementLineCategory({ line_type: "earnings" })).toBe("loaded_miles");
    expect(settlementLineCategory({ line_type: "deadhead_pay" })).toBe("empty_miles");
    expect(settlementLineCategory({ line_type: "something_new" })).toBe("something_new");
  });

  it("item comes from the catalog map only: printed category first, then an unambiguous reimbursement type", () => {
    expect(settlementLineItemId(USMCA_COMPANY_ID, { line_type: "reimbursement", description: "Driver Reimbursement-Fuel-Def" })).toBe("a37d5b67-ac60-4825-8511-37771e719078");
    expect(settlementLineItemId(USMCA_COMPANY_ID, { line_type: "reimbursement", description: "scale ticket", reimbursement_type: "scale" })).toBe("a0a97d92-8e54-41e6-ab0c-37cd23f39869");
    expect(settlementLineItemId(USMCA_COMPANY_ID, { line_type: "reimbursement", description: "fuel", reimbursement_type: "fuel" })).toBeNull();
    expect(settlementLineItemId(USMCA_COMPANY_ID, { line_type: "earnings", description: "Load 13601 — Loaded Miles" })).toBeNull();
  });

  it("updates only NULL columns and gives a new item quantity 1 @ amount when it had none", async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        calls.push(sql);
        if (sql.includes("FROM driver_finance.settlement_lines sl")) {
          return { rows: [
            { id: "a", line_type: "reimbursement", description: "x", category: null, item_id: null, quantity: null, reimbursement_type: "toll", deduction_type: null },
            { id: "b", line_type: "earnings", description: "Load 1", category: "loaded_miles", item_id: null, quantity: "100", reimbursement_type: null, deduction_type: null },
          ] };
        }
        return { rows: [] };
      }),
    };
    const r = await categorizeSettlementLines(client, { settlementId: "s", operatingCompanyId: USMCA_COMPANY_ID });
    expect(r).toMatchObject({ categorized: 1, itemsAssigned: 1, itemsUnmapped: 1 });
    const itemUpdate = calls.find((c) => c.includes("SET item_id"))!;
    expect(itemUpdate).toMatch(/quantity = COALESCE\(quantity, 1\)/);
    expect(itemUpdate).toMatch(/item_id IS NULL/);
    expect(calls.some((c) => /SET amount|INSERT/.test(c))).toBe(false);
  });
});
