export default {
  name: "verify-reports-customer-profitability-flag-human-labels",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-customer-profitability-flag-human-labels.mjs"]);
  },
};
