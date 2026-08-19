export default {
  name: "verify-external-fines-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-external-fines-staged-filters.mjs"]);
  },
};
