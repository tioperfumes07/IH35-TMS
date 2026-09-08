export default {
  name: "verify-bank-running-balance-uses-full-history",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bank-running-balance-uses-full-history.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-bank-running-balance-uses-full-history.mjs"]);
  },
};
