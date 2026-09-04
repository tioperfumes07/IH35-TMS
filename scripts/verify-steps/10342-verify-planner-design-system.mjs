export default {
  name: "verify-planner-design-system",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-planner-design-system.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-planner-design-system.mjs"]);
  },
};
