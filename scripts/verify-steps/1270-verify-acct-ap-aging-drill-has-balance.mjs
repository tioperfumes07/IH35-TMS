export default {
  name: "verify-acct-ap-aging-drill-has-balance",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-ap-aging-drill-has-balance.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-acct-ap-aging-drill-has-balance.mjs"]);
  },
};
