export default {
  name: "verify-program-system-cashflow-filter-panels",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-program-system-cashflow-filter-panels.mjs"]);
    await ctx.run("node", ["scripts/verify-91061-obligation-invoice-acct-slate-leftover-chrome.mjs"]);
  },
};
