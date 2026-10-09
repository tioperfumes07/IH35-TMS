/** Verify-step 3582 — TASK-F3582 TaskLinkPicker ParityTable surface bar. */
export default {
  name: "verify-task-link-picker-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-task-link-picker-parity-surface-bar.mjs"]);
    await ctx.run("node", ["scripts/verify-91118-drvmerges-teamsplit-stops-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-91118-drvmerges-teamsplit-stops-slate-leftover-chrome.mjs"]);
  },
};
