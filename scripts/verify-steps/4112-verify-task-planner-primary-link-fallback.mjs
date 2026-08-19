export default {
  name: "verify-task-planner-primary-link-fallback",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-task-planner-primary-link-fallback.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-task-planner-primary-link-fallback.mjs"]);
  },
};
