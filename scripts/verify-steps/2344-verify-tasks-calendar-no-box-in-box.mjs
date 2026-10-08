export default {
  name: "verify-tasks-calendar-no-box-in-box",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-tasks-calendar-no-box-in-box.mjs"]);
    // BANK leftover slate refuse piggyback (F91182)
    await ctx.run("node", ["scripts/verify-tasks-dqf-lawsuit-slate-leftover-chrome.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-tasks-dqf-lawsuit-slate-leftover-chrome.mjs"]);
  },
};
