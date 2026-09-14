export default {
  name: "verify-factoring-nav-reachable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-factoring-nav-reachable.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-factoring-nav-reachable.mjs"]);
  },
};
