/** Verify-step 3570 — ACCT-F3570 revenue recognition schedule ParityTable surface bar. */
export default {
  name: "verify-revenue-recognition-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-revenue-recognition-parity-surface-bar.mjs"]);
  },
};
