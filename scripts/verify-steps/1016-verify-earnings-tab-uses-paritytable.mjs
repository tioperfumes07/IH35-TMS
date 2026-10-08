export default {
  name: "verify:earnings-tab-uses-paritytable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-earnings-tab-uses-paritytable.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-earnings-tab-uses-paritytable.mjs"]);
    // BANK leftover slate refuse piggyback (F91177)
    await ctx.run("node", ["scripts/verify-earnings-users-feed-slate-leftover-chrome.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-earnings-users-feed-slate-leftover-chrome.mjs"]);
  },
};
