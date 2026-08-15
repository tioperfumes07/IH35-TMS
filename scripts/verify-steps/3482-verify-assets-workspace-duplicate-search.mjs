export default {
  name: "verify-assets-workspace-duplicate-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-assets-workspace-duplicate-search.mjs"]);
  },
};
