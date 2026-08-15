export default {
  name: "verify-settlements-qbo-chrome-surfaces",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlements-qbo-chrome-surfaces.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-settlements-qbo-chrome-surfaces.mjs"]);
  },
};
