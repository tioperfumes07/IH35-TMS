export default {
  name: "verify-assets-workspace-duplicate-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-assets-workspace-duplicate-search.mjs"]);
    // BANK leftover refuse — DotInspections/VehiclesMasterData/PartsMasterData house tokens
    await ctx.run("node", ["scripts/verify-dot-veh-parts-slate-leftover-chrome.mjs"]);
  },
};
