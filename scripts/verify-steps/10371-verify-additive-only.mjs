export default {
  name: "verify-additive-only",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-additive-only.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-additive-only.mjs"]);
  },
};
