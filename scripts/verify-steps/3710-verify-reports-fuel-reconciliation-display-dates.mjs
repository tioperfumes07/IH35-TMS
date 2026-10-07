export default {
  name: "verify-reports-fuel-reconciliation-display-dates",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-fuel-reconciliation-display-dates.mjs"]);
    // BANK leftover refuse — ReportCategory/ManagementReport/FuelRecon house tokens
    await ctx.run("node", ["scripts/verify-rpt-mgmt-fuel-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-rpt-mgmt-fuel-slate-leftover-chrome.mjs"]);
  },
};
