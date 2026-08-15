export default {
  name: "verify-maint-lists-duplicate-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-maint-lists-duplicate-search.mjs"]);
  },
};
