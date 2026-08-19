export default {
  name: "verify-book-load-edit-header-entitylink",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-book-load-edit-header-entitylink.mjs"]);
  },
};
