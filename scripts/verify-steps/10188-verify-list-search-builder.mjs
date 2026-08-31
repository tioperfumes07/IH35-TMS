export default {
  name: "verify-list-search-builder",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-list-search-builder.mjs"]);
  },
};
