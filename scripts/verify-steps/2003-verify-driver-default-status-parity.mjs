export default {
  name: "verify-driver-default-status-parity",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-default-status-parity.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-driver-default-status-parity.mjs"]);
  },
};
