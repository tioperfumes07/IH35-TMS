export default {
  name: "verify-banking-suggest-matches-wired",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-banking-suggest-matches-wired.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-banking-suggest-matches-wired.mjs"]);
  },
};
