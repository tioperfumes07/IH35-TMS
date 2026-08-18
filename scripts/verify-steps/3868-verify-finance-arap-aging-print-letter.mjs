export default {
  name: "verify-finance-arap-aging-print-letter",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-finance-arap-aging-print-letter.mjs"]);
  },
};
