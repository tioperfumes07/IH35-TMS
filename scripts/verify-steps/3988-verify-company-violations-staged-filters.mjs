export default {
  name: "verify-company-violations-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-company-violations-staged-filters.mjs"]);
  },
};
