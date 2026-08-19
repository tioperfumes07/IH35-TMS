export default {
  name: "verify-load-template-library-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-load-template-library-staged-filters.mjs"]);
  },
};
