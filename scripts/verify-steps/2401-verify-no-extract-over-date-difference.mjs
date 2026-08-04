export default {
  name: "verify-no-extract-over-date-difference",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-extract-over-date-difference.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-extract-over-date-difference.mjs"]);
  },
};
