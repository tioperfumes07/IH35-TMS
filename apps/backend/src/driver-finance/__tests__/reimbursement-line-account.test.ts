// 443.203 R (ACCT-F4432034) — an itemed reimbursement settlement line posts to ITS item's account at close, never the
// type-map fallback (USMCA 5310 Lumper Expense). Fails on old main: the close read posting_account_id ?? byType(type).
import { describe, expect, it, vi } from "vitest";
import { loadSettlementPayItems } from "../settlement-payrun-close.service.js";

const SCALE_ITEM = "a0a97d92-0000-4000-8000-000000000001";
const ACCT_5300 = "acct-5300-tolls-scales";
const ACCT_5310 = "acct-5310-lumper";

function client(reimbRows: Array<Record<string, unknown>>) {
  return {
    query: vi.fn(async (sql: string, values: unknown[] = []) => {
      if (sql.includes("sl.line_type = 'reimbursement'")) return { rows: reimbRows };
      if (sql.includes("FROM catalogs.items") && sql.includes("default_expense_account_id")) {
        return values[1] === SCALE_ITEM ? { rows: [{ id: SCALE_ITEM, item_name: "Scale", default_expense_account_id: ACCT_5300 }] } : { rows: [] };
      }
      if (sql.includes("FROM catalogs.accounts")) {
        return values[1] === ACCT_5300 ? { rows: [{ id: ACCT_5300, account_number: "5300", account_name: "Tolls & Scales" }] } : { rows: [] };
      }
      return { rows: [] };
    }),
  };
}

const row = (over: Record<string, unknown>) => ({ amount: "12.00", reimbursement_type: null, posting_account_id: null, load_id: "load-1", d: "2026-10-20", item_id: null, ...over });

describe("reimbursement settlement line account — the one rule", () => {
  const byType = vi.fn(async () => ACCT_5310);

  it("a Scale reimbursement line with its item and no stamped account posts to the item's 5300, not 5310 (fails old)", async () => {
    const items = await loadSettlementPayItems(client([row({ item_id: SCALE_ITEM })]) as never, "co", "s", { driverPay: "dp", detention: null, reimbursementByType: byType });
    const r = items.find((i) => i.kind === "reimbursement");
    expect(r?.accountId).toBe(ACCT_5300);
    expect(r?.itemId).toBe(SCALE_ITEM);
  });

  it("an item-less line keeps the type-map fallback", async () => {
    const items = await loadSettlementPayItems(client([row({})]) as never, "co", "s", { driverPay: "dp", detention: null, reimbursementByType: byType });
    expect(items.find((i) => i.kind === "reimbursement")?.accountId).toBe(ACCT_5310);
  });

  it("the account stamped on the line at creation wins", async () => {
    const items = await loadSettlementPayItems(client([row({ item_id: SCALE_ITEM, posting_account_id: "stamped" })]) as never, "co", "s", { driverPay: "dp", detention: null, reimbursementByType: byType });
    expect(items.find((i) => i.kind === "reimbursement")?.accountId).toBe("stamped");
  });

  it("an item whose account does not resolve is refused by name, never replaced by the type default", async () => {
    await expect(
      loadSettlementPayItems(client([row({ item_id: "other-item" })]) as never, "co", "s", { driverPay: "dp", detention: null, reimbursementByType: byType })
    ).rejects.toThrow(/not an active item/);
  });
});
