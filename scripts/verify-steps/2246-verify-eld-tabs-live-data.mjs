export default {
  name: "verify-eld-tabs-live-data",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-eld-tabs-live-data.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-eld-tabs-live-data.mjs"]);
  },
};
