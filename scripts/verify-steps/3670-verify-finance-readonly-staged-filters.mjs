export default {
  name: "verify-finance-readonly-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-finance-readonly-staged-filters.mjs"]);
    await ctx.run("node", ["scripts/verify-91066-settle-finhub-billdet-slate-leftover-chrome.mjs"]);
  },
};
