export default {
  name: "verify-audit-425c-staged-filters",
  async run(ctx) {
    // BANK-F91553 leftover slate class refuse LIVE + leftover plant on --selftest.
    await ctx.run("node", ["scripts/verify-audit-425c-staged-filters.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-audit-425c-staged-filters.mjs"]);
  },
};
