export default {
  name: "verify-report-runner-empty-filters-theater",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-report-runner-empty-filters-theater.mjs"]);
  },
};
