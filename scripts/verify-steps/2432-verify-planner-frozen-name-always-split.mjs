export default {
  name: "verify-planner-frozen-name-always-split",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-planner-frozen-name-always-split.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-planner-frozen-name-always-split.mjs"]);
  },
};
