export default {
  name: "verify-lists-detail-types-list-cap-le-200",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lists-detail-types-list-cap-le-200.mjs"]);
    // BANK leftover refuse — FixedAssets / LoanWizard / Amortization house tokens
    await ctx.run("node", ["scripts/verify-91052-fixed-loan-amort-slate-leftover-chrome.mjs"]);
  },
};
