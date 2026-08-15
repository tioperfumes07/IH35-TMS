export default {
  name: "verify-accounting-genuine-tagged-gl-je-expense",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-accounting-genuine-tagged-gl-je-expense.mjs"]);
  },
};
