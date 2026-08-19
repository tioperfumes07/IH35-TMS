export default {
  name: "verify-settlement-disputes-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlement-disputes-staged-filters.mjs"]);
  },
};
