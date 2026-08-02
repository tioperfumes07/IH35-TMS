export default {
  name: "verify-dispatch-oos-gate-not-view-dependent",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatch-oos-gate-not-view-dependent.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-dispatch-oos-gate-not-view-dependent.mjs"]);
  },
};
