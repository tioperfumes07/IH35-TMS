export default {
  name: "verify-saf-drug-alcohol-tab-query-error-surface",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-drug-alcohol-tab-query-error-surface.mjs"]);
  },
};
