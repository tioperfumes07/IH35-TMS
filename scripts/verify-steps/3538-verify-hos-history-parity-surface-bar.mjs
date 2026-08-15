/** Verify-step 3538 — COMP-F3538 HOS history ParityTable surface bar. */
export default {
  name: "verify-hos-history-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-hos-history-parity-surface-bar.mjs"]);
  },
};
