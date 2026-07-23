export default {
  name: "verify-acct-cc-bill-payment-picker",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-cc-bill-payment-picker.mjs"]);
  },
};
