export default {
  name: "verify-safety-training-record-canonical-routes",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-training-record-canonical-routes.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-safety-training-record-canonical-routes.mjs"]);
  },
};
