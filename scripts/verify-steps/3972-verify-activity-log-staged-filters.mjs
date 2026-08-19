export default {
  name: "verify-activity-log-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-activity-log-staged-filters.mjs"]);
  },
};
