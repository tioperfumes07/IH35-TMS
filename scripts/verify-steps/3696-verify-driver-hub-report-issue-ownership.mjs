export default {
  name: "verify-driver-hub-report-issue-ownership",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-hub-report-issue-ownership.mjs"]);
    // BANK-F91222 piggyback — WOStatusPieChart / FleetUtilizationGauge / DriverHubReportingPage leftover slate refuse
    await ctx.run("node", ["scripts/verify-home-charts-hub-rpt-slate-leftover-chrome.mjs"]);
  },
};
