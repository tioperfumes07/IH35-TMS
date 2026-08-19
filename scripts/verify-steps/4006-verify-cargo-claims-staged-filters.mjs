export default {
  name: "verify-cargo-claims-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cargo-claims-staged-filters.mjs"]);
  },
};
