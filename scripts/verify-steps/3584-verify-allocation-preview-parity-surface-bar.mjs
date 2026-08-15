/** Verify-step 3584 — ACCT-F3584 AllocationPreviewTable ParityTable surface bar. */
export default {
  name: "verify-allocation-preview-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-allocation-preview-parity-surface-bar.mjs"]);
  },
};
