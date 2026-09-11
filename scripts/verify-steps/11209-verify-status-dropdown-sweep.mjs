export default {
  name: "verify-status-dropdown-sweep",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-status-dropdown-sweep.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-status-dropdown-sweep.mjs"]);
  },
};
