export default {
  name: "verify-saf-damage-report-detail-query-error-surface",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-damage-report-detail-query-error-surface.mjs"]);
  },
};
