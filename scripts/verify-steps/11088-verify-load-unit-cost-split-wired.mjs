export default {
  name: "verify-load-unit-cost-split-wired",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-load-unit-cost-split-wired.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-load-unit-cost-split-wired.mjs"]);
    // BANK-F91502 — LoadUnitCostSplit leftover fontSize: 11 refuse now included on this EVEN host.
  },
};
