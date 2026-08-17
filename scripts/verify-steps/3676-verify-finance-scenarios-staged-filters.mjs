export default {
  name: "verify-finance-scenarios-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-finance-scenarios-staged-filters.mjs"]);
  },
};
