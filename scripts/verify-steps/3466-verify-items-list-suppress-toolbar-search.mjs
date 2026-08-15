export default {
  name: "verify-items-list-suppress-toolbar-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-items-list-suppress-toolbar-search.mjs"]);
  },
};
