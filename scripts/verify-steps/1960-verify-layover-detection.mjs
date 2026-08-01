export default {
  name: "verify:layover-detection",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-layover-detection.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-layover-detection.mjs"]);
  },
};
