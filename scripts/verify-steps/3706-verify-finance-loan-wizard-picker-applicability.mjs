export default {
  name: "verify-finance-loan-wizard-picker-applicability",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-finance-loan-wizard-picker-applicability.mjs"]);
    await ctx.run("node", ["scripts/verify-91075-disputes-payrun-bankrecon-slate-leftover-chrome.mjs"]);
  },
};
