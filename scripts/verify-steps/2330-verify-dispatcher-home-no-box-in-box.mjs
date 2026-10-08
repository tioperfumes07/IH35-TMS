export default {
  name: "dispatcher-home-no-box-in-box",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatcher-home-no-box-in-box.mjs"]);
    // BANK leftover slate refuse piggyback (F91175)
    await ctx.run("node", ["scripts/verify-dispatcher-home-slate-leftover-chrome.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-dispatcher-home-slate-leftover-chrome.mjs"]);
  },
};
