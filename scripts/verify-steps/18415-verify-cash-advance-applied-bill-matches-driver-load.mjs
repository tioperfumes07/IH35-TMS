// 18415-verify-cash-advance-applied-bill-matches-driver-load — LEAD 443.113 BCF-02 (claimed in #26637).
// The driver bill an advance applies to is locked FOR UPDATE and must match driver + load + be live before allocation.
export default {
  name: "verify-cash-advance-applied-bill-matches-driver-load",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cash-advance-applied-bill-matches-driver-load.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-cash-advance-applied-bill-matches-driver-load.mjs"]);
  },
};
