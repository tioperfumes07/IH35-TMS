export default {
  name: "verify-vendor-credit-active-path",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-vendor-credit-active-path.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-vendor-credit-active-path.mjs"]);
  },
};
