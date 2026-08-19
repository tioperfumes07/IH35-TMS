export default {
  name: "verify-kanban-oos-strip-entitylinks",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-kanban-oos-strip-entitylinks.mjs"]);
  },
};
