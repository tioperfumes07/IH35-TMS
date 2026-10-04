export default {
  name: "verify-factoring-home-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-factoring-home-staged-filters.mjs"]);
    // BANK-F91453 — R315 Factoring Home cash-flow panel (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-factoring-r315-home-cash-flow.mjs", "--selftest"]);
  },
};
