/** Verify-step 3536 — ACCT-F3536 settlement disputes ParityTable surface bar. */
export default {
  name: "verify-settlement-disputes-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlement-disputes-parity-surface-bar.mjs"]);
  },
};
