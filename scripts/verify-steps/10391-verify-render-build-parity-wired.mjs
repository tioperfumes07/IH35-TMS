export default {
  name: "verify-render-build-parity-wired",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-render-build-parity-wired.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-render-build-parity-wired.mjs"]);
  },
};
