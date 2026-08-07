// verify-paritydrawer-money-dualpath-residual — §9.0 item 17 pattern sweep
export default {
  name: "verify:paritydrawer-money-dualpath-residual",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-paritydrawer-money-dualpath-residual.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-paritydrawer-money-dualpath-residual.mjs"]);
  },
};
