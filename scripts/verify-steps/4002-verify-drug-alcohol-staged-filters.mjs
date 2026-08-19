export default {
  name: "verify-drug-alcohol-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-drug-alcohol-staged-filters.mjs"]);
  },
};
