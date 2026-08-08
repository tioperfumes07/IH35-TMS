// verify-item-income-account-required — ACCT-F190 (Cascade FAIL-L2, API half).
//
// catalogs/items.routes.ts declared default_income_account_id as .optional() on create while the UI
// required it, so every non-UI caller created an item that can never post revenue. Prod, with the
// origin test applied (QBO clones excluded — their NULL is expected state under parallel books):
// 16 of 17 TMS-native items had no income account, while 16,552 of 21,215 invoice_lines reference
// an item.
//
// Selftest first, and one of its five mutations is the one that matters most: leaking the
// requirement into qbo-sync/items-write-sql.ts. QBO clones legitimately carry no local account
// mapping, so enforcing it there would BREAK THE IMPORT — a guard that only asked "is the field
// required somewhere" would wave that through.
export default {
  name: "verify:item-income-account-required",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-item-income-account-required.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-item-income-account-required.mjs"]);
  },
};
