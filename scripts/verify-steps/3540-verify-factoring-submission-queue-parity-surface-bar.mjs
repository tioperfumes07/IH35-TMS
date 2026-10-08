/** Verify-step 3540 — FAC-F3540 factoring submission queue ParityTable surface bar. */
export default {
  name: "verify-factoring-submission-queue-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-factoring-submission-queue-parity-surface-bar.mjs"]);
    ctx.run("node", ["scripts/verify-parts-fleet-hos-slate-leftover-chrome.mjs"]);
  },
};
