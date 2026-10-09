/** Verify-step 3586 — ACCT-F3586 CostBreakdownBox ParityTable surface bar. */
export default {
  name: "verify-cost-breakdown-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cost-breakdown-parity-surface-bar.mjs"]);
    await ctx.run("node", ["scripts/verify-91117-custfact-factoradmin-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-91117-custfact-factoradmin-slate-leftover-chrome.mjs"]);
  },
};
