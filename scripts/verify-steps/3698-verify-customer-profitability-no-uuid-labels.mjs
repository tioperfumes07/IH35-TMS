export default {
  name: "verify-customer-profitability-no-uuid-labels",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-customer-profitability-no-uuid-labels.mjs"]);
    await ctx.run("node", ["scripts/verify-91072-coaasym-schedrow-presettle-slate-leftover-chrome.mjs"]);
  },
};
