export default {
  name: "verify-reports-trip-profitability-two-decimal-money",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-trip-profitability-two-decimal-money.mjs"]);
  },
};
