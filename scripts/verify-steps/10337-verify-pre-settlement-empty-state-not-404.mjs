export default {
  name: "verify-pre-settlement-empty-state-not-404",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-pre-settlement-empty-state-not-404.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-pre-settlement-empty-state-not-404.mjs"]);
  },
};
