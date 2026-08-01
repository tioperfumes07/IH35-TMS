export default {
  name: "verify-revenue-category-map-seed",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-revenue-category-map-seed.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-revenue-category-map-seed.mjs"]);
  },
};
