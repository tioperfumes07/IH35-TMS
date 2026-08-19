export default {
  name: "verify-book-load-customer-entitylink",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-book-load-customer-entitylink.mjs"]);
  },
};
