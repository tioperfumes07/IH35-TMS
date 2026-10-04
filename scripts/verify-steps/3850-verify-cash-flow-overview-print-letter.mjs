export default {
  name: "verify-cash-flow-overview-print-letter",
  async run(ctx) {
    // BANK-F91489 leftover muted + BANK-F91543 leftover slate class refuse LIVE only.
    // Do not hang --selftest here: that path mutates the live page then restores.
    await ctx.run("node", ["scripts/verify-cash-flow-overview-print-letter.mjs"]);
  },
};
