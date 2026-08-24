export default {
  name: "verify-fleet-oos-strip-unit-entitylink",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fleet-oos-strip-unit-entitylink.mjs"]);
    await ctx.run("node", ["scripts/verify-fleet-oos-strip-unit-entitylink.mjs", "--selftest"]);
  },
};
