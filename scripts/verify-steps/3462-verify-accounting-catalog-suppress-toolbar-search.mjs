export default {
  name: "verify-accounting-catalog-suppress-toolbar-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-accounting-catalog-suppress-toolbar-search.mjs"]);
  },
};
