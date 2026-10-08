/** @type {import("./_context.mjs").VerifyStep} */
export default {
  name: "verify-home-driver-day-summary-toolbar-always",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-home-driver-day-summary-toolbar-always.mjs"]);
    // BANK-F91216 piggyback — FleetSnapshotPanel / DriverDaySummaryCard / HomeKpiCard leftover slate refuse
    await ctx.run("node", ["scripts/verify-home-fleet-drvday-kpi-slate-leftover-chrome.mjs"]);
  },
};
