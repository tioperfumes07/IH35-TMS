export default {
  name: "verify-factoring-submission-queue-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-factoring-submission-queue-staged-filters.mjs"]);
  },
};
