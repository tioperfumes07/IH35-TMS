export default {
  name: "verify-planner-design-ruling-09-04",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-planner-design-ruling-09-04.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-planner-design-ruling-09-04.mjs"]);
  },
};
