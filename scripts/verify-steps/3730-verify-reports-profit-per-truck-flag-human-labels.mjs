export default {
  name: "verify-reports-profit-per-truck-flag-human-labels",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-profit-per-truck-flag-human-labels.mjs"]);
    await ctx.run("node", ["scripts/verify-91102-qbodrift-paymeth-maintshop-slate-leftover-chrome.mjs"]);
  },
};
