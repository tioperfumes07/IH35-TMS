export default {
  name: "verify-saf-csa-score-tab-query-error-surface",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-csa-score-tab-query-error-surface.mjs"]);
  },
};
