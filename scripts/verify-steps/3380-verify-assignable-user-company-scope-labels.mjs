export default {
  name: "verify-assignable-user-company-scope-labels",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-assignable-user-company-scope-labels.mjs"]);
    // BANK leftover refuse — PageHelpLink / StaleDeployBanner / RelatedModuleLinks house tokens
    await ctx.run("node", ["scripts/verify-91297-help-stale-related-slate-leftover-chrome.mjs"]);
  },
};
