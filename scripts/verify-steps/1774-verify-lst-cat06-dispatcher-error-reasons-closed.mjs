export default {
  name: "verify-lst-cat06-dispatcher-error-reasons-closed",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lst-cat06-dispatcher-error-reasons-closed.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-lst-cat06-dispatcher-error-reasons-closed.mjs"]);
  },
};
