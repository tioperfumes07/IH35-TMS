export default {
  name: "verify-profit-per-truck-print-letter",
  async run(ctx) {
    // BANK-F91488 — ProfitPerTruck leftover muted refuse now included in this already-wired EVEN host.
    // Do not hang --selftest here: that path mutates the live page then restores.
    await ctx.run("node", ["scripts/verify-profit-per-truck-print-letter.mjs"]);
  },
};
