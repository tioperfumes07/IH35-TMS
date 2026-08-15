export default {
  name: "verify-vendors-customers-list-duplicate-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-vendors-customers-list-duplicate-search.mjs"]);
  },
};
