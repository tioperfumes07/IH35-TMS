export default {
  name: "verify-reports-cash-flow-compound-label-human",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-cash-flow-compound-label-human.mjs"]);
    await ctx.run("node", ["scripts/verify-91098-catdrawer-xfer-reconws-slate-leftover-chrome.mjs"]);
  },
};
