export default {
  name: "verify-reports-maint-cost-flag-human-labels",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-maint-cost-flag-human-labels.mjs"]);
    await ctx.run("node", ["scripts/verify-91101-multibill-collect-lease-slate-leftover-chrome.mjs"]);
  },
};
