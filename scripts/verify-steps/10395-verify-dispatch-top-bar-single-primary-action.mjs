export default {
  name: "verify-dispatch-top-bar-single-primary-action",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatch-top-bar-single-primary-action.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-dispatch-top-bar-single-primary-action.mjs"]);
  },
};
