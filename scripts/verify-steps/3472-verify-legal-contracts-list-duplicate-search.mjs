export default {
  name: "verify-legal-contracts-list-duplicate-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-legal-contracts-list-duplicate-search.mjs"]);
  },
};
