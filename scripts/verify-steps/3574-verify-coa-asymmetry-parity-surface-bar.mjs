/** Verify-step 3574 — ACCT-F3574 CoA asymmetry ParityTable surface bar. */
export default {
  name: "verify-coa-asymmetry-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-coa-asymmetry-parity-surface-bar.mjs"]);
  },
};
