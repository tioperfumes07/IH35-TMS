export default {
  name: "verify:book-load-miles-required",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-book-load-miles-required.mjs"]);
    await ctx.run("node", ["scripts/verify-g1-trailer-choice-required.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-g2-creator-trailer-equipment-required.mjs", "--selftest"]);
  },
};
