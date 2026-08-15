/** Verify-step 3558 — TASK-F3558 entity TasksTab ParityTable surface bar. */
export default {
  name: "verify-tasks-tab-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-tasks-tab-parity-surface-bar.mjs"]);
  },
};
