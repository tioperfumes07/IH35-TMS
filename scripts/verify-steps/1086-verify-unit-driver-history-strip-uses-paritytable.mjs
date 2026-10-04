export default {
  name: "verify:unit-driver-history-strip-uses-paritytable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-unit-driver-history-strip-uses-paritytable.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-unit-driver-history-strip-uses-paritytable.mjs"]);
    // BANK-F91472 — driver-profile ORDERS complete (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-driver-profile-orders-complete.mjs", "--selftest"]);
  },
};
