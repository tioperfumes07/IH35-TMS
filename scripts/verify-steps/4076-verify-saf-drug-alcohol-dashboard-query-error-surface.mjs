export default {
  name: "verify-saf-drug-alcohol-dashboard-query-error-surface",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-drug-alcohol-dashboard-query-error-surface.mjs"]);
  },
};
