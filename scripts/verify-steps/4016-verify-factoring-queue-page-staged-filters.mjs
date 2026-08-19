export default {
  name: "verify-factoring-queue-page-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-factoring-queue-page-staged-filters.mjs"]);
  },
};
