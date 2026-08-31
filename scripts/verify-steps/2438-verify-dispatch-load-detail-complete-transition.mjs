export default {
  name: "verify-dispatch-load-detail-complete-transition",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatch-load-detail-complete-transition.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-dispatch-load-detail-complete-transition.mjs"]);
  },
};
