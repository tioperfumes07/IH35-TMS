export default {
  name: "verify-integrity-alerts-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-integrity-alerts-staged-filters.mjs"]);
  },
};
