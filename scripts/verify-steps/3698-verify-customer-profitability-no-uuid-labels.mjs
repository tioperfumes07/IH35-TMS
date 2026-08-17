export default {
  name: "verify-customer-profitability-no-uuid-labels",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-customer-profitability-no-uuid-labels.mjs"]);
  },
};
