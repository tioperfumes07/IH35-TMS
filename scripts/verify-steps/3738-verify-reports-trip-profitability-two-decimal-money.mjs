export default {
  name: "verify-reports-trip-profitability-two-decimal-money",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-trip-profitability-two-decimal-money.mjs"]);
    await ctx.run("node", ["scripts/verify-91099-tripprofit-loadbank-checklist-slate-leftover-chrome.mjs"]);
  },
};
