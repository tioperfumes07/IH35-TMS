export default {
  name: "verify-reg048-kanban-unit-dedup",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reg048-kanban-unit-dedup.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-reg048-kanban-unit-dedup.mjs"]);
  },
};
