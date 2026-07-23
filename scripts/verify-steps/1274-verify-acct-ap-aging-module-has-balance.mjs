export default {
  name: "verify-acct-ap-aging-module-has-balance",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-ap-aging-module-has-balance.mjs"]);
  },
};
