/** CC-2 — ACC-18. scripts/verify-health-financial-checks.mjs already existed and correctly
 * asserted LEDGER_FINANCIAL_HEALTH_CHECKS is wired into GET /api/v1/healthz, but had no --selftest
 * and was never wired into any verify-step — the same "written but never run" pattern this session
 * found repeatedly (load-costs-board, bank-feed-live-tieout). Added a selftest with planted
 * mutations and wired it here. Paired with a new ObservabilityPage.tsx section that renders every
 * live healthz check (ledger/financial checks called out separately), closing the "screen renders
 * it" leg of ACC-18 — the page used to only link out to raw JSON. */
export default {
  name: "verify-health-financial-checks",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-health-financial-checks.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-health-financial-checks.mjs"]);
  },
};
