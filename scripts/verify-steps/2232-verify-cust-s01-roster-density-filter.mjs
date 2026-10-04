export default {
  name: "verify-cust-s01-roster-density-filter",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cust-s01-roster-density-filter.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-cust-s01-roster-density-filter.mjs"]);
    // BANK-F91440 — C-19/C-31 With-transactions default roster (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-c19-has-transactions-default.mjs", "--selftest"]);
  },
};
