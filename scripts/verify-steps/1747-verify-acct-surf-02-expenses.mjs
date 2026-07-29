// Step 1747 — ACCT-SURF-02: Expenses deep structural DoD (route + ParityDrawer create chrome +
// payload + canonical accounting.expenses INSERT + EntityLink vendor/journal_entry/expense).
// Rule 17: guards wire ONLY through scripts/verify-steps/NNNN-*.mjs.
export default {
  name: "verify-acct-surf-02-expenses",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-surf-02-expenses.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-acct-surf-02-expenses.mjs"]);
  },
};
