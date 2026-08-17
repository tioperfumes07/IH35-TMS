export default {
  name: "verify-maint-wo-console-kanban-view",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-maint-wo-console-kanban-view.mjs"]);
  },
};
