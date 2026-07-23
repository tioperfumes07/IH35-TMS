export default {
  name: "verify-acct-receive-payment-deposit",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-receive-payment-deposit.mjs"]);
  },
};
