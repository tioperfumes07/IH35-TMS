export default {
  name: "verify-runner-filters-entity-pickers",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-runner-filters-entity-pickers.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-runner-filters-entity-pickers.mjs"]);
  },
};
