export default {
  name: "verify-settlement-detail-bookend-loads-in-cycle",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-setl-detail-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-setl-detail-slate-leftover-chrome.mjs"]);
    await ctx.run("node", ["scripts/verify-settlement-detail-bookend-loads-in-cycle.mjs"]);
  },
};
