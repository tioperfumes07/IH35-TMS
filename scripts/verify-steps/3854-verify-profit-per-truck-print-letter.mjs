export default {
  name: "verify-profit-per-truck-print-letter",
  async run(ctx) {
    // BANK-F91488 leftover muted + BANK-F91545 leftover slate class refuse LIVE only.
    // Do not hang --selftest here: that path mutates the live page then restores.
    await ctx.run("node", ["scripts/verify-profit-per-truck-print-letter.mjs"]);
  },
};
