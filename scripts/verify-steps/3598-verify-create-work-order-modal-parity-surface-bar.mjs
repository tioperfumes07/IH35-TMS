export default {
  name: "verify-create-work-order-modal-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-create-work-order-modal-parity-surface-bar.mjs"]);
    await ctx.run("node", ["scripts/verify-91114-reimb-netpay-setlhdr-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-91114-reimb-netpay-setlhdr-slate-leftover-chrome.mjs"]);
  },
};
