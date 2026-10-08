export default {
  name: "verify-hoverdropdown-click-after-hover",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-hoverdropdown-click-after-hover.mjs"]);
    // BANK leftover refuse — MaintenanceSnapshot / ThreeMileCpm / PmCostPerMile house tokens
    await ctx.run("node", ["scripts/verify-91282-veh-cpm-maint-slate-leftover-chrome.mjs"]);
  },
};
