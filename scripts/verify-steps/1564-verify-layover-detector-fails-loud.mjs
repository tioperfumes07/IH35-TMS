export default {
  name: "verify-layover-detector-fails-loud",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-layover-detector-fails-loud.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-layover-detector-fails-loud.mjs"]);
  },
};
