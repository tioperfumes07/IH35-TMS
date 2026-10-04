export default {
  name: "verify-safety-training-record-canonical-routes",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-training-record-canonical-routes.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-safety-training-record-canonical-routes.mjs"]);
    // BANK-F91491 — LoadCostsBoard leftover fontSize: 10 refuse (10481 is ODD; leftover now on this EVEN host).
    await ctx.run("node", ["scripts/verify-load-costs-board-no-truncation-no-wrap.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-load-costs-board-no-truncation-no-wrap.mjs"]);
  },
};
