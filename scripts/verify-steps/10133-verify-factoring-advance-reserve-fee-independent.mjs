export default {
  name: "verify-factoring-advance-reserve-fee-independent",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-factoring-advance-reserve-fee-independent.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-factoring-advance-reserve-fee-independent.mjs"]);
  },
};
