export default {
  name: "verify-fixed-asset-autopost-trk-enable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fixed-asset-autopost-trk-enable.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-fixed-asset-autopost-trk-enable.mjs"]);
  },
};
