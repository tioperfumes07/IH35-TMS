// Step 1746 — ACCT-F43: the held posting flags resolve per-entity ONLY, are armed for their
// owner-named entities only (prepaid/FH-3 = TRK + USMCA, depreciation autopost = TRK), and no
// chart-of-accounts control role is bound to an account picked by name shape.
// Companion belt to 1723 (QBO write-back flags stay OFF) and 1732 (an armed flag names its accounts).
// Rule 17: guards wire ONLY through scripts/verify-steps/NNNN-*.mjs.
export default {
  name: "verify-held-posting-flag-entity-scope",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-held-posting-flag-entity-scope.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-held-posting-flag-entity-scope.mjs"]);
  },
};
