export default {
  name: "verify-finance-scenarios-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-finance-scenarios-staged-filters.mjs"]);
    // BANK leftover refuse — FinanceScenarios / BreakEven / FinancialStatements house tokens
    await ctx.run("node", ["scripts/verify-fin-scenarios-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-fin-scenarios-slate-leftover-chrome.mjs"]);
  },
};
