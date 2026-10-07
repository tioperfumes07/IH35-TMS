/** Verify-step 3532 — ACCT-F3532 cash-advance requests ParityTable surface bar. */
export default {
  name: "verify-cash-advance-requests-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cash-advance-requests-parity-surface-bar.mjs"]);
    // BANK leftover refuse — PortalDashboard/PortalRouteGuard/CashAdvanceRequests house tokens
    await ctx.run("node", ["scripts/verify-portal-adv-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-portal-adv-slate-leftover-chrome.mjs"]);
  },
};
