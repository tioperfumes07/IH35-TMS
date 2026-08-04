export default {
  name: "verify-fuel-gl-scope-matched-tieout",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fuel-gl-scope-matched-tieout.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-fuel-gl-scope-matched-tieout.mjs"]);
  },
};
