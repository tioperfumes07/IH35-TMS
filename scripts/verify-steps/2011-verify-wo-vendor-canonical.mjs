export default {
  name: "verify-wo-vendor-canonical",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-wo-vendor-canonical.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-wo-vendor-canonical.mjs"]);
  },
};
