export default {
  name: "verify-saf-integrity-reports-query-error-surface",
  async run(ctx) {
    // BANK-F91522 — IntegrityReportsTab leftover inactive-pill border #cbd5e1 → house #E5E7EB.
    await ctx.run("node", ["scripts/verify-saf-integrity-reports-query-error-surface.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-saf-integrity-reports-query-error-surface.mjs"]);
  },
};
