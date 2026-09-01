export default {
  name: "verify-tieout-usmca-scope-pin",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-tieout-usmca-scope-pin.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-tieout-usmca-scope-pin.mjs"]);
  },
};
