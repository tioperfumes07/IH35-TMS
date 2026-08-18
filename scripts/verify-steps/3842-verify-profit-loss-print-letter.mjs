export default {
  name: "verify-profit-loss-print-letter",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-profit-loss-print-letter.mjs"]);
  },
};
