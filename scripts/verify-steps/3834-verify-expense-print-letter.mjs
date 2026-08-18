export default {
  name: "verify-expense-print-letter",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-expense-print-letter.mjs"]);
  },
};
