/** Verify-step 3534 — ACCT-F3534 escrow pending ParityTable surface bar. */
export default {
  name: "verify-escrow-pending-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-escrow-pending-parity-surface-bar.mjs"]);
    await ctx.run("node", ["scripts/verify-91123-loadwo-custnotif-revdrill-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-91123-loadwo-custnotif-revdrill-slate-leftover-chrome.mjs"]);
  },
};
