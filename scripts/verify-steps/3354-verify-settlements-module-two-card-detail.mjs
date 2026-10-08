export default {
  name: "verify:settlements-module-two-card-detail",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlements-module-two-card-detail.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-settlements-module-two-card-detail.mjs"]);
    // BANK leftover refuse — MatchDrawer / BankingHome / TransfersListPage house tokens
    await ctx.run("node", ["scripts/verify-91298-match-home-xfer-slate-leftover-chrome.mjs"]);
  },
};
