export default {
  name: "verify-acct-bill-payments-has-balance",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-bill-payments-has-balance.mjs"]);
  },
};
