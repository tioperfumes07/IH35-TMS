export default {
  name: "verify-revrec-latch-respects-reversal",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-revrec-latch-respects-reversal.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-revrec-latch-respects-reversal.mjs"]);
  },
};
