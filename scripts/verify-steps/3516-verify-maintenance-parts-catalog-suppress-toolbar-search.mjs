export default {
  name: "verify-maintenance-parts-catalog-suppress-toolbar-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-maintenance-parts-catalog-suppress-toolbar-search.mjs"]);
    // BANK leftover refuse — EquipmentTypes/DriverLoadStatuses/DriverLayoverHistory house tokens
    await ctx.run("node", ["scripts/verify-equip-drv-status-slate-leftover-chrome.mjs"]);
  },
};
