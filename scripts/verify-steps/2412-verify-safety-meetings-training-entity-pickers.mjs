export default {
  name: "verify-safety-meetings-training-entity-pickers",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-meetings-training-entity-pickers.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-safety-meetings-training-entity-pickers.mjs"]);
  },
};
