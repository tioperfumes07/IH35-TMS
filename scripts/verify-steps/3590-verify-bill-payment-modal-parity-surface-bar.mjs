export default {
  name: "verify-bill-payment-modal-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bill-payment-modal-parity-surface-bar.mjs"]);
    await ctx.run("node", ["scripts/verify-91116-unit-load-drv-transit-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-91116-unit-load-drv-transit-slate-leftover-chrome.mjs"]);
  },
};
