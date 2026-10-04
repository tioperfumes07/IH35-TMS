export default {
  name: "verify-customer-profitability-print-letter",
  async run(ctx) {
    // BANK-F91497 — leftover fontSize: 10 refuse is live-only (print-letter --selftest mutates the page).
    await ctx.run("node", ["scripts/verify-customer-profitability-print-letter.mjs"]);
  },
};
