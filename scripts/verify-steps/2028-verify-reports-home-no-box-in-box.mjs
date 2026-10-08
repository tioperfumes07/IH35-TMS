export default {
  name: "verify-reports-home-no-box-in-box",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-home-no-box-in-box.mjs"]);
    // BANK leftover slate refuse piggyback (F91181)
    await ctx.run("node", ["scripts/verify-rpt-final-tasks-slate-leftover-chrome.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-rpt-final-tasks-slate-leftover-chrome.mjs"]);
  },
};
