export default {
  name: "verify-safety-fines-entitylink-labels",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-fines-entitylink-labels.mjs"]);
  },
};
