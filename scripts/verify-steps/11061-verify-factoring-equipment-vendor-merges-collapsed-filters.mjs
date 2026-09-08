export default {
  name: "verify-factoring-equipment-vendor-merges-collapsed-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-factoring-equipment-vendor-merges-collapsed-filters.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-factoring-equipment-vendor-merges-collapsed-filters.mjs"]);
  },
};
