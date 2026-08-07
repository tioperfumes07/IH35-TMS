export default {
  name: "verify-safety-accident-spawn-liability",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-accident-spawn-liability.mjs"]);
  },
};
