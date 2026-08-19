export default {
  name: "verify-pre-settlement-panel-driver-entitylink",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-pre-settlement-panel-driver-entitylink.mjs"]);
  },
};
