/** Verify-step 3542 — FAC-F3542 factoring submission workqueue ParityTable surface bar. */
export default {
  name: "verify-factoring-submission-workqueue-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-factoring-submission-workqueue-parity-surface-bar.mjs"]);
  },
};
