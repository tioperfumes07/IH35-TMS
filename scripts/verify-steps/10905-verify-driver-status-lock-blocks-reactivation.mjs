export default {
  name: "verify-driver-status-lock-blocks-reactivation",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-status-lock-blocks-reactivation.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-driver-status-lock-blocks-reactivation.mjs"]);
  },
};
