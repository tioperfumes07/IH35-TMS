export default {
  name: "verify-profit-per-truck-duplicate-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-profit-per-truck-duplicate-search.mjs"]);
    // BANK leftover refuse — CreateWOSectionValidation/BackhaulSuggestions/HosDriverMapPreview house tokens
    await ctx.run("node", ["scripts/verify-wo-backhaul-hos-slate-leftover-chrome.mjs"]);
  },
};
