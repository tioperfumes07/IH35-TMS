export default {
  name: "verify-bills-list-vendor-name-resolved",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bills-list-vendor-name-resolved.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-bills-list-vendor-name-resolved.mjs"]);
    await ctx.run("node", ["scripts/verify-91166-cash-advances-slate-leftover-chrome.mjs"]);
  },
};
