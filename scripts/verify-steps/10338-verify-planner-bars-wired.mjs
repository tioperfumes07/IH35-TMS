export default {
  name: "verify-planner-bars-wired",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-planner-bars-wired.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-planner-bars-wired.mjs"]);
  },
};
