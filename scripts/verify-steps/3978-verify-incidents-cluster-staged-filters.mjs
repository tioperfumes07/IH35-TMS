export default {
  name: "verify-incidents-cluster-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-incidents-cluster-staged-filters.mjs"]);
  },
};
