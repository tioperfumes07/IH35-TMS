export default {
  name: "verify-qbo-bill-payment-subledger-only",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-qbo-bill-payment-subledger-only.mjs"]);
  },
};
