export default {
  name: "verify-maint-lists-duplicate-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-maint-lists-duplicate-search.mjs"]);
    // BANK leftover refuse — DtcAuto/CompanyViolationTypes/DriversReferenceCatalog house tokens
    await ctx.run("node", ["scripts/verify-dtc-coviol-drvref-slate-leftover-chrome.mjs"]);
  },
};
