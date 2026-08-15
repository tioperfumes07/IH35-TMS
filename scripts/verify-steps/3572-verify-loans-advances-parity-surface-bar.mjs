/** Verify-step 3572 — ACCT-F3572 Loans & Advances ParityTable surface bar. */
export default {
  name: "verify-loans-advances-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-loans-advances-parity-surface-bar.mjs"]);
  },
};
