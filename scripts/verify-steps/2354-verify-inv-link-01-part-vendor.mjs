export default {
  name: "verify-inv-link-01-part-vendor",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-inv-link-01-part-vendor.mjs"]);
  },
};
