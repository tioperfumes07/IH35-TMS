export default {
  name: "verify-safety-training-record-canonical-routes",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-training-record-canonical-routes.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-safety-training-record-canonical-routes.mjs"]);
    // BANK-F91491 leftover fontSize: 10 + BANK-F91551 leftover slate class refuse (10481 is ODD).
    await ctx.run("node", ["scripts/verify-load-costs-board-no-truncation-no-wrap.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-load-costs-board-no-truncation-no-wrap.mjs"]);
  },
};
