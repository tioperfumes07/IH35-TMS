export default {
  name: "verify-hos-tracker-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-hos-tracker-staged-filters.mjs"]);
  },
};
