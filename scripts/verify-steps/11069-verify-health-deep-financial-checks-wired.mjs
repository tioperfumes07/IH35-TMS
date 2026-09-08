export default {
  name: "verify-health-deep-financial-checks-wired",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-health-deep-financial-checks-wired.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-health-deep-financial-checks-wired.mjs"]);
  },
};
