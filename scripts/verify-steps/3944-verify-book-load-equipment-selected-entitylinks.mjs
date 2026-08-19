export default {
  name: "verify-book-load-equipment-selected-entitylinks",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-book-load-equipment-selected-entitylinks.mjs"]);
  },
};
