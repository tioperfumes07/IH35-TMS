export default {
  name: "verify-saf-safety-layout-query-error-surface",
  async run(ctx) {
    // BANK-F91554 leftover slate class refuse LIVE + leftover plant on --selftest.
    await ctx.run("node", ["scripts/verify-saf-safety-layout-query-error-surface.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-saf-safety-layout-query-error-surface.mjs"]);
  },
};
