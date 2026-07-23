export default {
  name: "verify-acct-pay-bill-bank-picker",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-pay-bill-bank-picker.mjs"]);
  },
};
