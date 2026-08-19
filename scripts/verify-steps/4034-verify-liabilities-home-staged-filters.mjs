export default {
  name: "verify-liabilities-home-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-liabilities-home-staged-filters.mjs"]);
  },
};
