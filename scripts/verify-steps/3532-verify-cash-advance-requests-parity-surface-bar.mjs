/** Verify-step 3532 — ACCT-F3532 cash-advance requests ParityTable surface bar. */
export default {
  name: "verify-cash-advance-requests-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cash-advance-requests-parity-surface-bar.mjs"]);
  },
};
