export default {
  name: "verify-acct-payment-detail-has-balance",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-payment-detail-has-balance.mjs"]);
  },
};
