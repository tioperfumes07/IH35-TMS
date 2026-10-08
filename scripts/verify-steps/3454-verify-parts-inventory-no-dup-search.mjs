export default {
  name: "verify-parts-inventory-no-dup-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-parts-inventory-no-dup-search.mjs"]);
    // BANK leftover refuse — OwnerOverrideLogPage / LoadCreateModal / InTransitIssuesPage house tokens
    await ctx.run("node", ["scripts/verify-91278-disp-owner-create-transit-slate-leftover-chrome.mjs"]);
  },
};
