/** Verify-step 3546 — BANK-F3546 bank account visibility ParityTable surface bar. */
export default {
  name: "verify-bank-account-visibility-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bank-account-visibility-parity-surface-bar.mjs"]);
  },
};
