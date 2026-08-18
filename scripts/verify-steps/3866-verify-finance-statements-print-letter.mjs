export default {
  name: "verify-finance-statements-print-letter",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-finance-statements-print-letter.mjs"]);
  },
};
