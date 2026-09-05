export default {
  name: "verify-planner-grid-sortable-frozen-columns",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-planner-grid-sortable-frozen-columns.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-planner-grid-sortable-frozen-columns.mjs"]);
  },
};
