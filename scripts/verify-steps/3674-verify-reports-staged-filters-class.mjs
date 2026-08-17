export default {
  name: "verify-reports-staged-filters-class",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-staged-filters-class.mjs"]);
  },
};
