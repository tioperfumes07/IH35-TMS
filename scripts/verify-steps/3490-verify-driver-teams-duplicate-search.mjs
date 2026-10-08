export default {
  name: "verify-driver-teams-duplicate-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-teams-duplicate-search.mjs"]);
    // BANK leftover refuse — AnomalyAlerts/OemParts/IFTA StepWizard house tokens
    await ctx.run("node", ["scripts/verify-anom-oem-ifta-slate-leftover-chrome.mjs"]);
  },
};
