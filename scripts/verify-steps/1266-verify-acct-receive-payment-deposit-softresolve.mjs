export default {
  name: "verify-acct-receive-payment-deposit-softresolve",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-receive-payment-deposit-softresolve.mjs"]);
  },
};
