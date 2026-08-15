export default {
  name: "verify-customer-payment-history-scope-label",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-customer-payment-history-scope-label.mjs"]);
  },
};
