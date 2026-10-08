export default {
  name: "verify-vendors-customers-list-duplicate-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-vendors-customers-list-duplicate-search.mjs"]);
    // BANK leftover refuse — DriverTeamsPage / MaintenanceServicesCatalog / lists-safety-shared house tokens
    await ctx.run("node", ["scripts/verify-91275-drv-teams-maint-slate-leftover-chrome.mjs"]);
  },
};
