export default {
  name: "verify-g18-expense-line-category-and-load-exemption",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-g18-expense-line-category-and-load-exemption.mjs"]);
  },
};
