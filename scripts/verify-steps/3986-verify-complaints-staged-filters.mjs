export default {
  name: "verify-complaints-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-complaints-staged-filters.mjs"]);
  },
};
