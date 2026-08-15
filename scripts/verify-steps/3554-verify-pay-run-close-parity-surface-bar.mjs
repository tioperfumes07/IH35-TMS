/** Verify-step 3554 — SETL-F3554 pay-run close JE legs ParityTable surface bar. */
export default {
  name: "verify-pay-run-close-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-pay-run-close-parity-surface-bar.mjs"]);
  },
};
