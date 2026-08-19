export default {
  name: "verify-safety-events-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-events-staged-filters.mjs"]);
  },
};
