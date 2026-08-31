export default {
  name: "verify-safety-layout-outlet-key",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-layout-outlet-key.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-safety-layout-outlet-key.mjs"]);
  },
};
