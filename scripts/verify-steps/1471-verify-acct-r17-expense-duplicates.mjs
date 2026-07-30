// Step 1471 — ACCT-R-17 duplicate expense detection (Cursor range 1400–1499).
// Rule 17: verify-steps ONLY — never edit package.json / ci.yml / locked-guards.
export default {
  name: "verify-acct-r17-expense-duplicates",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-r17-expense-duplicates.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-acct-r17-expense-duplicates.mjs"]);
  },
};
