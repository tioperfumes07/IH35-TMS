export default {
  name: "verify-safety-hos-dashboard-wire",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-hos-dashboard-wire.mjs"]);
    await ctx.run("node", ["scripts/verify-safety-hos-dashboard-wire.mjs", "--selftest"]);
  },
};
