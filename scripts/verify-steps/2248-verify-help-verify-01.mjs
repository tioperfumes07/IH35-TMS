export default {
  name: "verify-help-verify-01",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-help-verify-01.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-help-verify-01.mjs"]);
  },
};
