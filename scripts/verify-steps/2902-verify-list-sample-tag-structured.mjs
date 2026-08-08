export default {
  name: "verify-list-sample-tag-structured",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-list-sample-tag-structured.mjs"]);
  },
};
