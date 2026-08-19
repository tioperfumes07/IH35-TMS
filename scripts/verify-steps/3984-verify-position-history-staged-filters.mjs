export default {
  name: "verify-position-history-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-position-history-staged-filters.mjs"]);
  },
};
