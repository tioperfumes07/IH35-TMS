export default {
  name: "verify-finance-preview-readiness",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-finance-preview-readiness.mjs"]);
    await ctx.run("node", ["scripts/verify-notif-parity-recon-slate-leftover-chrome.mjs"]);
  },
};
