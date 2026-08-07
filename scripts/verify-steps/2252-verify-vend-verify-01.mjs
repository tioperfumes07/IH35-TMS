export default {
  name: "verify-vend-verify-01",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-vend-verify-01.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-vend-verify-01.mjs"]);
  },
};
