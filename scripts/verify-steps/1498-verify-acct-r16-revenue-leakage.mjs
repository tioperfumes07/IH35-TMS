// Step 1498 — ACCT-R-16 ASC 606 revenue leakage / unbilled tracking (Cursor range 1400–1499).
// Rule 17: verify-steps ONLY — never edit package.json / ci.yml / locked-guards.
export default {
  name: "verify-acct-r16-revenue-leakage",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-r16-revenue-leakage.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-acct-r16-revenue-leakage.mjs"]);
  },
};
