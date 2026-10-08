export default {
  name: "verify-items-list-suppress-toolbar-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-items-list-suppress-toolbar-search.mjs"]);
    // BANK leftover refuse — ExpensiveStatesMultiselect / CompliancePanel / AutoDeductionPolicies house tokens
    await ctx.run("node", ["scripts/verify-91276-fuel-states-comp-slate-leftover-chrome.mjs"]);
  },
};
