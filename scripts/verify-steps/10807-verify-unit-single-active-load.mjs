export default {
  name: "verify-unit-single-active-load",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-unit-single-active-load.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-unit-single-active-load.mjs"]);
  },
};
