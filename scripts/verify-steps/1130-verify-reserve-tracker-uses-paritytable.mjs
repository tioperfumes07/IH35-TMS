export default {
  name: "verify:reserve-tracker-uses-paritytable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reserve-tracker-uses-paritytable.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-reserve-tracker-uses-paritytable.mjs"]);
    // BANK-F91455 — R315 FactoringReservesSharedPanel (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-factoring-r315-reserves-shared.mjs", "--selftest"]);
  },
};
