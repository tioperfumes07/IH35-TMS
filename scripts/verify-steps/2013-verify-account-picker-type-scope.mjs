export default {
  name: "verify-account-picker-type-scope",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-account-picker-type-scope.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-account-picker-type-scope.mjs"]);
  },
};
