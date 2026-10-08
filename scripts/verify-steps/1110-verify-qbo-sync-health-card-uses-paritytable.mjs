export default {
  name: "verify:qbo-sync-health-card-uses-paritytable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-qbo-sync-health-card-uses-paritytable.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-qbo-sync-health-card-uses-paritytable.mjs"]);
    // BANK leftover refuse — home QBO / pending approvals / vendor mapping house tokens
    await ctx.run("node", ["scripts/verify-home-qbo-vendor-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-home-qbo-vendor-slate-leftover-chrome.mjs"]);
  },
};
