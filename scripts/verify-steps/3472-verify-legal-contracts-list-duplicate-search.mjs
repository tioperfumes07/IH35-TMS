export default {
  name: "verify-legal-contracts-list-duplicate-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-legal-contracts-list-duplicate-search.mjs"]);
    // BANK leftover refuse — ScheduledReportsBackendPendingBanner / ReportBlockVPendingBanner / ReportBlockTPendingBanner house tokens
    await ctx.run("node", ["scripts/verify-91274-rpt-pending-slate-leftover-chrome.mjs"]);
  },
};
