export default {
  name: "verify-inv-s01-parts-roster-density",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-inv-s01-parts-roster-density.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-inv-s01-parts-roster-density.mjs"]);
  },
};
