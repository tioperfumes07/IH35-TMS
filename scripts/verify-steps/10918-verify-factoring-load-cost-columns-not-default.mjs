export default {
  name: "verify-factoring-load-cost-columns-not-default",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-factoring-load-cost-columns-not-default.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-factoring-load-cost-columns-not-default.mjs"]);
  },
};
