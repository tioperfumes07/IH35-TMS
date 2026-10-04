export default {
  name: "verify-fault-drafts-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fault-drafts-staged-filters.mjs"]);
    // BANK-F91463 — E-40 Faults view (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-e40-faults-view.mjs", "--selftest"]);
  },
};
