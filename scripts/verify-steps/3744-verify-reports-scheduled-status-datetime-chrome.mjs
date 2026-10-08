export default {
  name: "verify-reports-scheduled-status-datetime-chrome",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-scheduled-status-datetime-chrome.mjs"]);
    // BANK leftover slate refuse piggyback (F91195)
    await ctx.run("node", ["scripts/verify-fuel-deadhead-sched-slate-leftover-chrome.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-fuel-deadhead-sched-slate-leftover-chrome.mjs"]);
  },
};
