export default {
  name: "verify-company-waterfall-fuel-expense-split",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-company-waterfall-fuel-expense-split.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-company-waterfall-fuel-expense-split.mjs"]);
  },
};
