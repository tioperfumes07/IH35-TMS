export default {
  name: "verify-safety-driver-score-unit-entitylink",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-driver-score-unit-entitylink.mjs"]);
  },
};
