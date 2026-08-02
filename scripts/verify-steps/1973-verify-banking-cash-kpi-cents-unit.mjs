export default {
  name: "verify-banking-cash-kpi-cents-unit",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-banking-cash-kpi-cents-unit.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-banking-cash-kpi-cents-unit.mjs"]);
  },
};
