export default {
  name: "verify-kanban-compact-card-entitylinks",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-kanban-compact-card-entitylinks.mjs"]);
  },
};
