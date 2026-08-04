export default {
  name: "verify-fuel-miscategorization-reclass-tool",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fuel-miscategorization-reclass-tool.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-fuel-miscategorization-reclass-tool.mjs"]);
  },
};
