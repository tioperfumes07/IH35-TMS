/**
 * ROUND 142.3 — wires scripts/reconcile-feed-day.mjs into CI.
 * The day-close gate. Takes one purchase day, returns exit 0 (GREEN) or exit 1 (RED).
 * Run with: node scripts/reconcile-feed-day.mjs <purchase_day>
 * Selftest: node scripts/reconcile-feed-day.mjs --selftest
 */
export default {
  name: "reconcile-feed-day",
  async run(ctx) {
    // The gate runs the selftest in CI (no day arg = selftest mode for the verify-step).
    // Feeders run the full gate manually after each day: node scripts/reconcile-feed-day.mjs 8/10/26
    await ctx.run("node", ["scripts/reconcile-feed-day.mjs", "--selftest"]);
  },
};
