/** Verify-step 3566 — FA-F3566 fixed assets depreciation schedule ParityTable surface bar. */
export default {
  name: "verify-fixed-assets-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fixed-assets-parity-surface-bar.mjs"]);
  },
};
