export default {
  name: "verify-safety-anomalies-subject-entitylink",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-anomalies-subject-entitylink.mjs"]);
  },
};
