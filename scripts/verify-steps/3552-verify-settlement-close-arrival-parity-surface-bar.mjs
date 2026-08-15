/** Verify-step 3552 — SETL-F3552 settlement close arrival draft JE ParityTable surface bar. */
export default {
  name: "verify-settlement-close-arrival-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlement-close-arrival-parity-surface-bar.mjs"]);
  },
};
