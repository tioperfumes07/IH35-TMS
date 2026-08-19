export default {
  name: "verify-hos-violations-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-hos-violations-staged-filters.mjs"]);
  },
};
