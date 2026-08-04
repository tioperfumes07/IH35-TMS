export default {
  name: "verify-banking-kpi-not-dead-view",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-banking-kpi-not-dead-view.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-banking-kpi-not-dead-view.mjs"]);
  },
};
