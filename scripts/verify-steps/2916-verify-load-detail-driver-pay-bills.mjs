export default {
  name: "verify:load-detail-driver-pay-bills",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-load-detail-driver-pay-bills.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-load-detail-driver-pay-bills.mjs"]);
    await ctx.run("node", ["scripts/verify-91183-factor-vend-alloc-slate-leftover-chrome.mjs"]);
  },
};
