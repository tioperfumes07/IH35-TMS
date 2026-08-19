export default {
  name: "verify-safety-b24-label-tests-mock-get-driver-labels",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-b24-label-tests-mock-get-driver-labels.mjs"]);
  },
};
