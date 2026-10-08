export default {
  name: "verify:geofences-page-uses-paritytable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-geofences-page-uses-paritytable.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-geofences-page-uses-paritytable.mjs"]);
    // BANK leftover slate refuse piggyback (F91178)
    await ctx.run("node", ["scripts/verify-dispatch-board-geo-slate-leftover-chrome.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-dispatch-board-geo-slate-leftover-chrome.mjs"]);
  },
};
