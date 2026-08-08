// verify-billline-category-not-account-id — ACCT-F194.
//
// accounting/bills.service.ts bound `line.expenseCategoryUuid ?? accountId`, writing a GL ACCOUNT id
// into expense_category_uuid whenever a caller supplied no category. The poster resolves categories
// through expense_category_account_map KEYED ON A CATEGORY UUID, so an account id there matches
// nothing and the expense is SILENTLY UNCATEGORIZED — no error, no log, a P&L line that never lands
// in its category. Prod had 4 such rows, three written on 2026-08-07, every one with
// expense_category_uuid exactly equal to account_id.
//
// The guard forbids the defect verbatim AND any non-null fallback, because the next author's
// convenient column would fail identically. Selftest first: a static check that nobody has proven
// still detects anything is worth nothing.
export default {
  name: "verify:billline-category-not-account-id",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-billline-category-not-account-id.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-billline-category-not-account-id.mjs"]);
  },
};
