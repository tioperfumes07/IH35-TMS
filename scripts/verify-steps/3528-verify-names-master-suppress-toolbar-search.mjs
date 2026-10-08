/** Verify-step 3528 — LST-F3528 Names Master Hub duplex Search suppress. */
export default {
  name: "verify-names-master-suppress-toolbar-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-names-master-suppress-toolbar-search.mjs"]);
    // BANK leftover refuse — SafetyKpiBar/DriverManagerKpiBar/KpiStatCard house tokens
    await ctx.run("node", ["scripts/verify-home-kpi-bars-slate-leftover-chrome.mjs"]);
  },
};
