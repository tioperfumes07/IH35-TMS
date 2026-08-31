export default {
  name: "verify-driver-qualification-sets-opco-guc",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-qualification-sets-opco-guc.mjs"]);
  },
};
