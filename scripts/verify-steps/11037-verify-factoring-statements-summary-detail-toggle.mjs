export default {
  name: "verify-factoring-statements-summary-detail-toggle",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-factoring-statements-summary-detail-toggle.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-factoring-statements-summary-detail-toggle.mjs"]);
  },
};
