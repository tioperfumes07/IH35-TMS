/** Verify-step 3562 — DRV-F3562 driver payment methods card ParityTable surface bar. */
export default {
  name: "verify-driver-payment-methods-card-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-payment-methods-card-parity-surface-bar.mjs"]);
  },
};
