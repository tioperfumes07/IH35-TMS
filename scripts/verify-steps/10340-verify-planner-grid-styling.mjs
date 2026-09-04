export default {
  name: "verify-planner-grid-styling",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-planner-grid-styling.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-planner-grid-styling.mjs"]);
  },
};
