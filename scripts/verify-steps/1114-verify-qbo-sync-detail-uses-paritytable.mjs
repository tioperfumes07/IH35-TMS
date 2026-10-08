export default {
  name: "verify:qbo-sync-detail-uses-paritytable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-qbo-sync-detail-uses-paritytable.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-qbo-sync-detail-uses-paritytable.mjs"]);
    // BANK leftover slate refuse piggyback (F91197)
    await ctx.run("node", ["scripts/verify-qbo-acc-csa-slate-leftover-chrome.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-qbo-acc-csa-slate-leftover-chrome.mjs"]);
  },
};
