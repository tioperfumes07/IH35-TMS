export default {
  name: "verify-workflow-yaml-block-scalars",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-workflow-yaml-block-scalars.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-workflow-yaml-block-scalars.mjs"]);
  },
};
