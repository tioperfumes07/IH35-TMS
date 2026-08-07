export default {
  name: "verify-shadow-redirects",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-shadow-redirects.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-shadow-redirects.mjs"]);
  },
};
