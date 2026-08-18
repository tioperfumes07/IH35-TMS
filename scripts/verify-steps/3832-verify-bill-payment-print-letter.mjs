export default {
  name: "verify-bill-payment-print-letter",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bill-payment-print-letter.mjs"]);
  },
};
