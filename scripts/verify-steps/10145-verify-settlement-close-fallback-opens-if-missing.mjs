export default {
  name: "verify-settlement-close-fallback-opens-if-missing",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlement-close-fallback-opens-if-missing.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-settlement-close-fallback-opens-if-missing.mjs"]);
  },
};
