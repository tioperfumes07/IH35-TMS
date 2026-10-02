import { describe, expect, it, vi } from "vitest";

vi.mock("../coa-roles/resolver.service.js", () => ({ resolveRoleAccountOptional: vi.fn(async () => "acct-9000-uncategorized") }));
vi.mock("../expense-category-map/resolver.service.js", () => ({
  resolveAccountForCategory: vi.fn(),
  ExpenseCategoryMapResolutionError: class extends Error {},
  EXPENSE_CATEGORY_MAP_KIND_VALUES: ["expense_category"],
}));

import { resolveBillLineDebitAccount, BillLineAccountError } from "../bill-account-resolver.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
function client(item: { account_id: string | null; item_name: string } | null) {
  return {
    query: vi.fn(async (sql: string, p?: unknown[]) => {
      if (sql.includes("FROM catalogs.items")) return { rows: item ? [item] : [] };
      if (sql.includes("FROM catalogs.accounts")) return { rows: [{ id: String(p?.[0]) }] };
      return { rows: [] };
    }),
  };
}

describe("queue item 11 (G-08) — an itemized bill line posts to its item's account, never uncategorized / 9000", () => {
  it("item with an account -> the item's account", async () => {
    const r = await resolveBillLineDebitAccount(client({ account_id: "acct-5320", item_name: "TRACTOR-Washout Expense" }), OPCO, { item_id: "40d73df6-07c0-418f-9e37-c6d7cde5b7b8" });
    expect(r).toMatchObject({ account_id: "acct-5320", method: "catalog_item_account" });
  });

  it("item with no account -> refused by name, not parked", async () => {
    await expect(resolveBillLineDebitAccount(client({ account_id: null, item_name: "Line Haul" }), OPCO, { item_id: "73c9a22a-86ed-4132-b8e2-fdfb1288dd2f" })).rejects.toBeInstanceOf(BillLineAccountError);
  });

  it("explicit account still wins over the item", async () => {
    const r = await resolveBillLineDebitAccount(client({ account_id: "acct-5320", item_name: "x" }), OPCO, { explicit_account_id: "acct-explicit", item_id: "i" });
    expect(r.method).toBe("bill_line_explicit_account");
  });

  it("no item, no category -> the uncategorized role, unchanged", async () => {
    const r = await resolveBillLineDebitAccount(client(null), OPCO, {});
    expect(r.method).toBe("uncategorized_expense_role");
  });
});
