export default {
  name: "verify-invoice-create-modal-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-invoice-create-modal-parity-surface-bar.mjs"]);
    await ctx.run("node", ["scripts/verify-91115-issue-hos-disputes-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-91115-issue-hos-disputes-slate-leftover-chrome.mjs"]);
  },
};
