export default {
  name: "verify-integrity-alerts-staged-filters",
  async run(ctx) {
    // BANK-F91522 — IntegrityAlertsPage leftover inactive-pill border #cbd5e1 → house #E5E7EB.
    // BANK-F91534 — leftover Tailwind slate-* classes → house #4B5563 / #1F2A44.
    await ctx.run("node", ["scripts/verify-integrity-alerts-staged-filters.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-integrity-alerts-staged-filters.mjs"]);
    await ctx.run("node", ["scripts/verify-unmatched-7d-is-an-alert.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-unmatched-7d-is-an-alert.mjs"]);
    await ctx.run("node", ["scripts/verify-bank-match-is-a-document-pointer.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-bank-match-is-a-document-pointer.mjs"]);
    await ctx.run("node", ["scripts/verify-relay-deposit-is-a-bank-match-candidate.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-relay-deposit-is-a-bank-match-candidate.mjs"]);
    // BANK-F44329 — wire orphan banking / relay guards (registry census ratchet <= 3).
    await ctx.run("node", ["scripts/verify-bank-feed-action-buttons.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-bank-feed-action-buttons.mjs"]);
    await ctx.run("node", ["scripts/verify-creator-relay-row-posts-through-its-fill.mjs"]);
  },
};
