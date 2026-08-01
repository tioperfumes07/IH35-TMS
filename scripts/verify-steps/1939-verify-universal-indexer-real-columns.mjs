export default {
  name: "verify-universal-indexer-real-columns",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-universal-indexer-real-columns.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-universal-indexer-real-columns.mjs"]);
  },
};
