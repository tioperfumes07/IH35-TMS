export default {
  name: "verify-submit-factoring-modal-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-submit-factoring-modal-parity-surface-bar.mjs"]);
    ctx.run("node", ["scripts/verify-legal-module-flyout-slate-leftover-chrome.mjs"]);
  },
};
