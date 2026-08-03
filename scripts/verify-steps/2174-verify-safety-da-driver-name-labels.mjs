export default {
  name: "verify-safety-da-driver-name-labels",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-da-driver-name-labels.mjs"]);
  },
};
