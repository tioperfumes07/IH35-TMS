export default {
  name: "verify-settlement-debt-view-not-stub",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlement-debt-view-not-stub.mjs"]);
  },
};
