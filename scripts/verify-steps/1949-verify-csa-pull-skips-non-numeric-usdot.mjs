export default {
  name: "verify-csa-pull-skips-non-numeric-usdot",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-csa-pull-skips-non-numeric-usdot.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-csa-pull-skips-non-numeric-usdot.mjs"]);
  },
};
