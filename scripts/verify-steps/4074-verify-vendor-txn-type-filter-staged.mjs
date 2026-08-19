export default {
  name: "verify-vendor-txn-type-filter-staged",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-vendor-txn-type-filter-staged.mjs"]);
  },
};
