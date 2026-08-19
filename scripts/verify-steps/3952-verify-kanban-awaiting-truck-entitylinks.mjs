export default {
  name: "verify-kanban-awaiting-truck-entitylinks",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-kanban-awaiting-truck-entitylinks.mjs"]);
  },
};
