export default {
  name: "verify-reports-customer-profitability-flag-human-labels",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-customer-profitability-flag-human-labels.mjs"]);
    await ctx.run("node", ["scripts/verify-91100-ccpay-vendbill-expcreate-slate-leftover-chrome.mjs"]);
  },
};
