export default {
  name: "verify-help-center-eight-categories",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-help-center-eight-categories.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-help-center-eight-categories.mjs"]);
  },
};
