export default {
  name: "verify-qbo-vendor-credits-mirror",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-qbo-vendor-credits-mirror.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-qbo-vendor-credits-mirror.mjs"]);
  },
};
