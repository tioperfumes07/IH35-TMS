export default {
  name: "verify-factoring-no-duplicate-kpi-band",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-factoring-no-duplicate-kpi-band.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-factoring-no-duplicate-kpi-band.mjs"]);
  },
};
