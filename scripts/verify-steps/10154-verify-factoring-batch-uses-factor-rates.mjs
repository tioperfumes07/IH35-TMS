export default {
  name: "verify-factoring-batch-uses-factor-rates",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-factoring-batch-uses-factor-rates.mjs"]);
  },
};
