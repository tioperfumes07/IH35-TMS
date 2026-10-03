import { describe, expect, it, vi } from "vitest";
import { resolveLineItemAndAccount } from "../line-item-account.js";

// ROUND 363-CC2-D — the item / account picked on a wizard line. A pick that does not resolve is refused, never replaced.
const CO = "11111111-1111-4111-8111-111111111111";
const ITEM = "22222222-2222-4222-8222-222222222222";
const ACCT = "33333333-3333-4333-8333-333333333333";
const DEFAULT = "44444444-4444-4444-8444-444444444444";

function client(item: Record<string, unknown> | null, account: Record<string, unknown> | null) {
  return {
    query: vi.fn(async (sql: string) => ({ rows: /catalogs\.items/.test(sql) ? (item ? [item] : []) : account ? [account] : [] })),
  };
}

describe("resolveLineItemAndAccount", () => {
  it("no pick: null, so the caller keeps its documented default", async () => {
    const c = client(null, null);
    expect(await resolveLineItemAndAccount(c, CO, {})).toBeNull();
    expect(c.query).not.toHaveBeenCalled();
  });
  it("the picked account wins over the item's default", async () => {
    const c = client({ id: ITEM, item_name: "Fuel-Reefer-Diesel", default_expense_account_id: DEFAULT }, { id: ACCT, account_number: "5010", account_name: "Reefer Fuel" });
    const out = await resolveLineItemAndAccount(c, CO, { item_id: ITEM, account_id: ACCT });
    expect(out).toMatchObject({ item_id: ITEM, account_id: ACCT });
    expect(c.query.mock.calls[1][1]).toEqual([CO, ACCT]);
  });
  it("an item alone posts to the item's default account", async () => {
    const c = client({ id: ITEM, item_name: "Lumper", default_expense_account_id: DEFAULT }, { id: DEFAULT, account_number: "5300", account_name: "Lumper" });
    expect(await resolveLineItemAndAccount(c, CO, { item_id: ITEM })).toMatchObject({ account_id: DEFAULT });
  });
  it("refuses an item that is not this company's", async () => {
    expect(await resolveLineItemAndAccount(client(null, null), CO, { item_id: ITEM })).toMatchObject({ refused: expect.stringContaining("not an active item") });
  });
  it("refuses an item with no default account and no account picked", async () => {
    const c = client({ id: ITEM, item_name: "Misc", default_expense_account_id: null }, null);
    expect(await resolveLineItemAndAccount(c, CO, { item_id: ITEM })).toMatchObject({ refused: expect.stringContaining("pick the account") });
  });
  it("refuses an account that is not this company's (or inactive)", async () => {
    expect(await resolveLineItemAndAccount(client(null, null), CO, { account_id: ACCT })).toMatchObject({ refused: expect.stringContaining("not an active account") });
  });
});
