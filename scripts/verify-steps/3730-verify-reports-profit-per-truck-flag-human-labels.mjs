export default {
  name: "verify-reports-profit-per-truck-flag-human-labels",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-profit-per-truck-flag-human-labels.mjs"]);
  },
};
