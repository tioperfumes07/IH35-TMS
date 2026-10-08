export default {
  name: "verify-catalog-table-duplicate-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-catalog-table-duplicate-search.mjs"]);
    // BANK leftover refuse — Inspections/DriversMasterData/InTransitIssues house tokens
    await ctx.run("node", ["scripts/verify-insp-drv-transit-slate-leftover-chrome.mjs"]);
  },
};
