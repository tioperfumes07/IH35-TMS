export default {
  name: "verify-matrix-live-leaf-explicit",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-matrix-live-leaf-explicit.mjs"]);
    await ctx.run("node", ["scripts/verify-matrix-live-leaf-explicit.mjs", "--selftest"]);
  },
};
