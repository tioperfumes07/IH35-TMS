export default {
  name: "verify-factoring-chargebacks-summary-not-interleaved",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-factoring-chargebacks-summary-not-interleaved.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-factoring-chargebacks-summary-not-interleaved.mjs"]);
  },
};
