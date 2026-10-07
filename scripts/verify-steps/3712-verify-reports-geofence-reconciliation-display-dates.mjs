export default {
  name: "verify-reports-geofence-reconciliation-display-dates",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-geofence-reconciliation-display-dates.mjs"]);
    // BANK leftover refuse — ReportsRunner/PerTruckCpm/GeofenceDwell house tokens
    await ctx.run("node", ["scripts/verify-runner-cpm-geo-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-runner-cpm-geo-slate-leftover-chrome.mjs"]);
  },
};
