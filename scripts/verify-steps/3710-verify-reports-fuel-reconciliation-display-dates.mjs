export default {
  name: "verify-reports-fuel-reconciliation-display-dates",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-fuel-reconciliation-display-dates.mjs"]);
  },
};
