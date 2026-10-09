/** Verify-step 3546 — BANK-F3546 bank account visibility ParityTable surface bar. */
export default {
  name: "verify-bank-account-visibility-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bank-account-visibility-parity-surface-bar.mjs"]);
    await ctx.run("node", ["scripts/verify-91120-drvref-onboard-fuel-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-91120-drvref-onboard-fuel-slate-leftover-chrome.mjs"]);
  },
};
