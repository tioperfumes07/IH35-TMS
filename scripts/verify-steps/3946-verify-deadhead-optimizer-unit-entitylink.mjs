export default {
  name: "verify-deadhead-optimizer-unit-entitylink",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-deadhead-optimizer-unit-entitylink.mjs"]);
  },
};
