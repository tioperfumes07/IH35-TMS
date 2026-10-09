export default {
  name: "verify-settlements-fe-has-tests",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlements-fe-has-tests.mjs"]);
    await ctx.run("node", ["scripts/verify-91187-layout-datapane-drill-subtab-slate-leftover-chrome.mjs"]);
  },
};
