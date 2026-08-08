export default {
  name: "verify-settlements-fe-has-tests",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlements-fe-has-tests.mjs"]);
  },
};
