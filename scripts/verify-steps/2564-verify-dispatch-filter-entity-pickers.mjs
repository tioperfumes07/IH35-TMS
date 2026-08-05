export default {
  name: "verify:dispatch-filter-entity-pickers",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatch-filter-entity-pickers.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-dispatch-filter-entity-pickers.mjs"]);
  },
};
