export default {
  name: "verify-assignment-history-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-assignment-history-staged-filters.mjs"]);
  },
};
