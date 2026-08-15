/** Verify-step 3556 — BANK-F3556 bank account detail ParityTable surface bar. */
export default {
  name: "verify-bank-account-detail-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bank-account-detail-parity-surface-bar.mjs"]);
  },
};
