export default {
  name: "verify-driver-catalog-suppress-toolbar-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-catalog-suppress-toolbar-search.mjs"]);
    // BANK leftover refuse — Breadcrumb/SearchResultItem/ExhibitCard house tokens
    await ctx.run("node", ["scripts/verify-shared-crumb-search-exhibit-slate-leftover-chrome.mjs"]);
  },
};
