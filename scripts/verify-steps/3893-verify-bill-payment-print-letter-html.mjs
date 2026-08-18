export default {
  name: "verify-bill-payment-print-letter-html",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bill-payment-print-letter-html.mjs"]);
  },
};
