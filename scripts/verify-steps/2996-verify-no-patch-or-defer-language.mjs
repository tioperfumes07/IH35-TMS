export default {
  name: "verify-no-patch-or-defer-language",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-patch-or-defer-language.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-patch-or-defer-language.mjs"]);
  },
};
