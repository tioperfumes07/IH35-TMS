export default {
  name: "verify-dispatch-status-view-not-stub",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatch-status-view-not-stub.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-dispatch-status-view-not-stub.mjs"]);
  },
};
