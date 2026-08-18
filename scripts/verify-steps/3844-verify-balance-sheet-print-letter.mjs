export default {
  name: "verify-balance-sheet-print-letter",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-balance-sheet-print-letter.mjs"]);
  },
};
