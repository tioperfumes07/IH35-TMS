export default {
  name: "verify-acct-surf-03-bill-payment",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-surf-03-bill-payment.mjs"]);
  },
};
