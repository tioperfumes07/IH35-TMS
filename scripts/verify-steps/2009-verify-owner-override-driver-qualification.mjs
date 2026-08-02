export default {
  name: "verify-owner-override-driver-qualification",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-owner-override-driver-qualification.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-owner-override-driver-qualification.mjs"]);
  },
};
