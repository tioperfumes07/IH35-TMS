export default {
  name: "verify-cash-flow-avp-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cash-flow-avp-staged-filters.mjs"]);
    await ctx.run("node", ["scripts/verify-91065-liab-recur-register-slate-leftover-chrome.mjs"]);
  },
};
