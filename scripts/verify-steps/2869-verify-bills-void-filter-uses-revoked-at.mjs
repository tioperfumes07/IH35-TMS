// verify-bills-void-filter-uses-revoked-at — ACCT-F202.
//
// accounting.bills carries TWO void columns written by different things: voidBill() sets revoked_at
// and NEVER voided_at, while 4 bills on prod carry voided_at from an out-of-band write no application
// code produces. So `WHERE b.voided_at IS NULL` matches EVERY properly-voided bill — it reads like an
// exclusion and excludes nothing.
//
// Five sites had it, and a grep found only two. The other three included BOTH supporting-doc
// predicates in the Form 425C Exhibit F report — the Chapter 11 MONTHLY OPERATING REPORT — which was
// presenting voided bills to the bankruptcy court as live liabilities. That is why this runs in CI
// rather than living as a one-time cleanup.
//
// The selftest runs first and pins the false positive this guard exists to avoid: revenue-leakage
// .service.ts binds the alias `b` to accounting.load_revenue_recognition_postings, not to bills, and
// an earlier sweep of mine nearly rewrote it. The check therefore resolves aliases through the
// FROM/JOIN that binds them, never by the alias letter.
export default {
  name: "verify:bills-void-filter-uses-revoked-at",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bills-void-filter-uses-revoked-at.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-bills-void-filter-uses-revoked-at.mjs"]);
  },
};
