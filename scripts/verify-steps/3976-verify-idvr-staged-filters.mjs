export default {
  name: "verify-idvr-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-idvr-staged-filters.mjs"]);
  },
};
