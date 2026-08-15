export default {
  name: "verify-legal-templates-list-duplicate-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-legal-templates-list-duplicate-search.mjs"]);
  },
};
