export default {
  name: "verify-inventory-assignments-no-dup-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-inventory-assignments-no-dup-search.mjs"]);
    // BANK leftover refuse — GeofenceReconciliation / Cancellations / MaintCostPerUnit house tokens
    await ctx.run("node", ["scripts/verify-91281-rpt-geofence-cancel-cpu-slate-leftover-chrome.mjs"]);
  },
};
