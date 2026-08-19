export default {
  name: "verify-internal-fines-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-internal-fines-staged-filters.mjs"]);
  },
};
