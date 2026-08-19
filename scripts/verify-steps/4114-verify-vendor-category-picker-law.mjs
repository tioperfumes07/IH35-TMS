export default {
  name: "verify-vendor-category-picker-law",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-vendor-category-picker-law.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-vendor-category-picker-law.mjs"]);
  },
};
