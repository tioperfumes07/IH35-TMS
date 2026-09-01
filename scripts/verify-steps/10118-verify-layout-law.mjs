export default {
  name: "verify-layout-law",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-layout-law.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-layout-law.mjs"]);
  },
};
