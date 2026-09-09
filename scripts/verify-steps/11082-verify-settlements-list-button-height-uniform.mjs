export default {
  name: "verify-settlements-list-button-height-uniform",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlements-list-button-height-uniform.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-settlements-list-button-height-uniform.mjs"]);
  },
};
