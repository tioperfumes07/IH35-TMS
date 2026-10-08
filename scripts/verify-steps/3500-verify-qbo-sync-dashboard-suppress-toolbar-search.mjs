export default {
  name: "verify-qbo-sync-dashboard-suppress-toolbar-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-qbo-sync-dashboard-suppress-toolbar-search.mjs"]);
    // BANK leftover refuse — Modal/FilterPopover/LicenseSection house tokens
    await ctx.run("node", ["scripts/verify-modal-filter-license-slate-leftover-chrome.mjs"]);
  },
};
