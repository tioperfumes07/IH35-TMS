export default {
  name: "verify-catalog-table-duplicate-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-catalog-table-duplicate-search.mjs"]);
  },
};
