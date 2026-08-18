export default {
  name: "verify-inventory-vendor-historical-label-resolver",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-inventory-vendor-historical-label-resolver.mjs"]);
  },
};
