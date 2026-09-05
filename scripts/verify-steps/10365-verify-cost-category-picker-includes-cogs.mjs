export default {
  name: "verify-cost-category-picker-includes-cogs",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cost-category-picker-includes-cogs.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-cost-category-picker-includes-cogs.mjs"]);
  },
};
