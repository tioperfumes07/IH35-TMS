export default {
  name: "verify-reports-cash-flow-overview-iso-axis",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-cash-flow-overview-iso-axis.mjs"]);
  },
};
