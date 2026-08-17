export default {
  name: "verify-finance-readonly-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-finance-readonly-staged-filters.mjs"]);
  },
};
