export default {
  name: "verify-saf-integrity-reports-query-error-surface",
  async run(ctx) {
    // BANK-F91522 — IntegrityReportsTab leftover inactive-pill border #cbd5e1 → house #E5E7EB.
    // BANK-F91533 — leftover Tailwind slate-* classes → house #1F2A44 / #4B5563 / #E5E7EB / #F7F8FA.
    await ctx.run("node", ["scripts/verify-saf-integrity-reports-query-error-surface.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-saf-integrity-reports-query-error-surface.mjs"]);
  },
};
