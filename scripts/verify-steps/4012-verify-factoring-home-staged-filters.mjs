export default {
  name: "verify-factoring-home-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-factoring-home-staged-filters.mjs"]);
  },
};
