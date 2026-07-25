export default {
  name: "verify-bankfeed-je-match",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bankfeed-je-match.mjs"]);
  },
};
