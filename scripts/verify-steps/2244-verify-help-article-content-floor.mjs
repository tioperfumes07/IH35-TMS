export default {
  name: "verify-help-article-content-floor",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-help-article-content-floor.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-help-article-content-floor.mjs"]);
  },
};
