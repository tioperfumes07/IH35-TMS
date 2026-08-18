export default {
  name: "verify-customer-profitability-print-letter",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-customer-profitability-print-letter.mjs"]);
  },
};
