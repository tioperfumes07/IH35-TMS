export default {
  name: "verify-cursor-driver-column-remainder",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cursor-driver-column-remainder.mjs"]);
    // BANK-F91153 piggy — RoadService/RecentActivity/CreateWOPaymentTiming slate leftover refuse
    await ctx.run("node", ["scripts/verify-91153-maint-road-activity-wo-slate-leftover-chrome.mjs"]);
  },
};
