export default {
  name: "verify-acc15-locations-is-sample-data",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acc15-locations-is-sample-data.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-acc15-locations-is-sample-data.mjs"]);
  },
};
