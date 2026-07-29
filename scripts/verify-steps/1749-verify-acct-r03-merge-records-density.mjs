// Step 1749 — ACCT-R-03: CoA merge writes catalogs.account_merge_records (density path pinned).
// Companion static repoint guard remains verify-acct-r03-coa-merge-repoint (1488).
// Rule 17: wire ONLY via verify-steps — do not edit package.json / locked-guards / ci.yml.
export default {
  name: "verify-acct-r03-merge-records-density",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-r03-merge-records-density.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-acct-r03-merge-records-density.mjs"]);
  },
};
