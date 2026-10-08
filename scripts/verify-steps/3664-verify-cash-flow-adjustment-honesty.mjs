export default {
  name: "verify-cash-flow-adjustment-honesty",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cash-flow-adjustment-honesty.mjs"]);
    // BANK leftover refuse — RollingLedger / ManualDailyProjections / DailyPrediction house tokens
    await ctx.run("node", ["scripts/verify-cf-rolling-proj-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-cf-rolling-proj-slate-leftover-chrome.mjs"]);
  },
};
