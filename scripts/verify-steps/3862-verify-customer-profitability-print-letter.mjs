export default {
  name: "verify-customer-profitability-print-letter",
  async run(ctx) {
    // BANK-F91497 leftover muted + BANK-F91544 leftover slate class refuse LIVE only.
    // Do not hang --selftest here: that path mutates the live page then restores.
    await ctx.run("node", ["scripts/verify-customer-profitability-print-letter.mjs"]);
  },
};
