export default {
  name: "verify-reports-cash-flow-overview-iso-axis",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-cash-flow-overview-iso-axis.mjs"]);
    await ctx.run("node", ["scripts/verify-91097-repurchase-editdeduct-settleclose-slate-leftover-chrome.mjs"]);
  },
};
