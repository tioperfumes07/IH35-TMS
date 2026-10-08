/** Verify-step 3580 — ACCT-F3580 Create Multiple Bills ParityTable surface bar. */
export default {
  name: "verify-create-multiple-bills-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-create-multiple-bills-parity-surface-bar.mjs"]);
    ctx.run("node", ["scripts/verify-legal-sign-lease-deadline-slate-leftover-chrome.mjs"]);
  },
};
