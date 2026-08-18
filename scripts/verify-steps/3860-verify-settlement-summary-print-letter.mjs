export default {
  name: "verify-settlement-summary-print-letter",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlement-summary-print-letter.mjs"]);
  },
};
