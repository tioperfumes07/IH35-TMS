export default {
  name: "verify-driver-detail-query-settles",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-detail-query-settles.mjs"]);
    // BANK leftover slate refuse piggyback (F91186)
    await ctx.run("node", ["scripts/verify-drv-cust-home-slate-leftover-chrome.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-drv-cust-home-slate-leftover-chrome.mjs"]);
  },
};
