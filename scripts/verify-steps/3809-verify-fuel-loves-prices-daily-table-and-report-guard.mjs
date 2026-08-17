export default {
  name: "verify-fuel-loves-prices-daily-table-and-report-guard",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fuel-loves-prices-daily-table-and-report-guard.mjs"]);
  },
};
