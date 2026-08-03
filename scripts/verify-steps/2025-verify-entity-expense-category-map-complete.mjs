export default {
  name: "verify-entity-expense-category-map-complete",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-entity-expense-category-map-complete.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-entity-expense-category-map-complete.mjs"]);
  },
};
