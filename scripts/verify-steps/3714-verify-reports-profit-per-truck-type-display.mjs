export default {
  name: "verify-reports-profit-per-truck-type-display",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-profit-per-truck-type-display.mjs"]);
    await ctx.run("node", ["scripts/verify-91076-qborecon-posting-period-slate-leftover-chrome.mjs"]);
  },
};
