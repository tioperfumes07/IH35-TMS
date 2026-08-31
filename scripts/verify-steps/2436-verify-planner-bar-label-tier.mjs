export default {
  name: "verify-planner-bar-label-tier",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-planner-bar-label-tier.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-planner-bar-label-tier.mjs"]);
  },
};
