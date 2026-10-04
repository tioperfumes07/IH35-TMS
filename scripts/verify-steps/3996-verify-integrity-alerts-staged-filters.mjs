export default {
  name: "verify-integrity-alerts-staged-filters",
  async run(ctx) {
    // BANK-F91522 — IntegrityAlertsPage leftover inactive-pill border #cbd5e1 → house #E5E7EB.
    await ctx.run("node", ["scripts/verify-integrity-alerts-staged-filters.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-integrity-alerts-staged-filters.mjs"]);
  },
};
