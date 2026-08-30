export default {
  name: "verify-factor-resolver-excludes-voided-inactive",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-factor-resolver-excludes-voided-inactive.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-factor-resolver-excludes-voided-inactive.mjs"]);
  },
};
