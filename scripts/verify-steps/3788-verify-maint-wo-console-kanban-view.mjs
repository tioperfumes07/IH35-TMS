export default {
  name: "verify-maint-wo-console-kanban-view",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-maint-wo-console-kanban-view.mjs"]);
    // BANK-F91452 — C-21 maintenance shell D24–D32 (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-c21-maintenance-shell.mjs", "--selftest"]);
  },
};
