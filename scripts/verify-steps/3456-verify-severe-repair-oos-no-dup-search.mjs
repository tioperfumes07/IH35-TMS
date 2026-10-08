export default {
  name: "verify-severe-repair-oos-no-dup-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-severe-repair-oos-no-dup-search.mjs"]);
    // BANK-F91219 piggyback — VehicleProfilePage / BulkActionBar / FleetOosStrip leftover slate refuse
    await ctx.run("node", ["scripts/verify-fleet-profile-bulk-oos-slate-leftover-chrome.mjs"]);
  },
};
