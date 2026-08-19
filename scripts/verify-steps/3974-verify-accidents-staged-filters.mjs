export default {
  name: "verify-accidents-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-accidents-staged-filters.mjs"]);
  },
};
