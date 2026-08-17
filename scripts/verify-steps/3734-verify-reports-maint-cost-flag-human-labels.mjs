export default {
  name: "verify-reports-maint-cost-flag-human-labels",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-maint-cost-flag-human-labels.mjs"]);
  },
};
