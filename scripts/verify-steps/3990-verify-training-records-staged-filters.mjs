export default {
  name: "verify-training-records-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-training-records-staged-filters.mjs"]);
  },
};
