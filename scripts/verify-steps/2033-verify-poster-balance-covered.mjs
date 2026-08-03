export default {
  name: "verify-poster-balance-covered",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-poster-balance-covered.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-poster-balance-covered.mjs"]);
  },
};
