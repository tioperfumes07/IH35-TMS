export default {
  name: "verify-safety-cargo-claim-entitylink-labels",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-cargo-claim-entitylink-labels.mjs"]);
  },
};
