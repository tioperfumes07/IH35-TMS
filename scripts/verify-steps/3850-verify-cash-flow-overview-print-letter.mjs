export default {
  name: "verify-cash-flow-overview-print-letter",
  async run(ctx) {
    // BANK-F91489 — CashFlowOverview leftover muted refuse now included in this already-wired EVEN host.
    // Do not hang --selftest here: that path mutates the live page then restores.
    await ctx.run("node", ["scripts/verify-cash-flow-overview-print-letter.mjs"]);
  },
};
