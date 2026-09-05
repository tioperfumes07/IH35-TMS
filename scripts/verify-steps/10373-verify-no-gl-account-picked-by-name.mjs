export default {
  name: "verify-no-gl-account-picked-by-name",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-gl-account-picked-by-name.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-gl-account-picked-by-name.mjs"]);
  },
};
