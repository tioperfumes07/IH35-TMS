export default {
  name: "verify-reg038-dispatch-home-kpi-columns",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reg038-dispatch-home-kpi-columns.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-reg038-dispatch-home-kpi-columns.mjs"]);
  },
};
