export default {
  name: "verify-cash-advances-home-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cash-advances-home-staged-filters.mjs"]);
  },
};
