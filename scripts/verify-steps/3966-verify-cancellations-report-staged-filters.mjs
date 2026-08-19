export default {
  name: "verify-cancellations-report-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cancellations-report-staged-filters.mjs"]);
  },
};
