/** Verify-step 3582 — TASK-F3582 TaskLinkPicker ParityTable surface bar. */
export default {
  name: "verify-task-link-picker-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-task-link-picker-parity-surface-bar.mjs"]);
  },
};
