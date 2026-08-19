export default {
  name: "verify-saf-anomaly-dashboard-query-error-surface",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-anomaly-dashboard-query-error-surface.mjs"]);
  },
};
