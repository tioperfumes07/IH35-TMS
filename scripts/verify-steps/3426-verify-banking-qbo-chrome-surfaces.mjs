export default {
  name: "verify-banking-qbo-chrome-surfaces",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-banking-qbo-chrome-surfaces.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-banking-qbo-chrome-surfaces.mjs"]);
  },
};
