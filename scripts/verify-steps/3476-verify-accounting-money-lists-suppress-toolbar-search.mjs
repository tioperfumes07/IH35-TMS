export default {
  name: "verify-accounting-money-lists-suppress-toolbar-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-accounting-money-lists-suppress-toolbar-search.mjs"]);
  },
};
