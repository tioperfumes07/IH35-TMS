export default {
  name: "verify-reports-staged-filters-class",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-staged-filters-class.mjs"]);
    // BANK leftover refuse — RunnerFilters/CsaFleetScoreCard/PortalLogin house tokens
    await ctx.run("node", ["scripts/verify-filt-csa-portal-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-filt-csa-portal-slate-leftover-chrome.mjs"]);
  },
};
