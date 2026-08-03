export default {
  name: "verify-safety-da-program-driver-labels",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-da-program-driver-labels.mjs"]);
  },
};
