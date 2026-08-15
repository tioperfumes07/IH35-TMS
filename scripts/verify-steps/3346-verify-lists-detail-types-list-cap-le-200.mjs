export default {
  name: "verify-lists-detail-types-list-cap-le-200",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lists-detail-types-list-cap-le-200.mjs"]);
  },
};
