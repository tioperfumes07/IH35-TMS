export default {
  name: "verify-task-planner-primary-link-fallback",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-task-planner-primary-link-fallback.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-task-planner-primary-link-fallback.mjs"]);
    // BANK-F91218 piggyback — TasksMinePage / TasksTab / TaskLinkPicker leftover slate refuse
    await ctx.run("node", ["scripts/verify-tasks-mine-tab-link-slate-leftover-chrome.mjs"]);
  },
};
