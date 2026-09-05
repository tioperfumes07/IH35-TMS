export default {
  name: "verify-planner-row-columns",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-planner-row-columns.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-planner-row-columns.mjs"]);
  },
};
