/** Verify-step 3550 — FUEL-F3550 Relay deposit review ParityTable surface bar. */
export default {
  name: "verify-relay-deposit-review-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-relay-deposit-review-parity-surface-bar.mjs"]);
  },
};
