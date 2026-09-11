export default {
  name: "verify-kanban-status-correctness-fix",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-kanban-status-correctness-fix.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-kanban-status-correctness-fix.mjs"]);
  },
};
