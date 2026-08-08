// verify-catalog-column-collision-safe — ACCT-F192 (Cascade FAIL-L3, P0).
//
// catalogs/accounting/factory.ts built its INSERT column list as
// [codeColumn, nameColumn, descriptionColumn, ...]. TWO registered catalogs map both onto ONE
// physical column — payment_terms ('terms_name') and account_role_bindings ('role_key') — so the
// statement named that column twice and PostgreSQL rejected it. Every POST returned 500.
//
// The guard is written against the CLASS: it asserts the BUILDER de-duplicates and refuses a value
// conflict, and deliberately leaves the configs free — mapping two logical fields onto one column is
// legitimate when a catalog's display name IS its code. Forbidding that would have been the easy
// assertion and the wrong one.
//
// Selftest first, and it asserts the collision detector still finds BOTH real catalogs BY NAME, so
// the guard cannot quietly stop covering the very cases it was written for.
export default {
  name: "verify:catalog-column-collision-safe",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-catalog-column-collision-safe.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-catalog-column-collision-safe.mjs"]);
  },
};
