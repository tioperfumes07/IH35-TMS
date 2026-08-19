export default {
  name: "verify-cash-advance-requests-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cash-advance-requests-staged-filters.mjs"]);
  },
};
