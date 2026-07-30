export default {
  name: "verify-lst-a01-hub-reachability-closed",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lst-a01-hub-reachability-closed.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-lst-a01-hub-reachability-closed.mjs"]);
  },
};
