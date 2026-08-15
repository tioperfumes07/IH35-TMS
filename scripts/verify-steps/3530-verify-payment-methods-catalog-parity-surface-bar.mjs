/** Verify-step 3530 — ACCT-F3530 payment methods catalog ParityTable surface bar. */
export default {
  name: "verify-payment-methods-catalog-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-payment-methods-catalog-parity-surface-bar.mjs"]);
  },
};
