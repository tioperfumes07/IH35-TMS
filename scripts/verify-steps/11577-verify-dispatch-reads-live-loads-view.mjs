/**
 * ROUND 36.1 views.live_loads (PR #22248) shipped verify-dispatch-reads-live-loads-view.mjs but
 * never wired it into CI's verify-steps + orphan-guard-registry matrix -- found while closing the
 * 2 CC-3-filed orphans (docs/audit/GUARD-WORKORDERS.md ORPHAN-GUARD-REGISTRY-2-NEW-GUARDS-UNWIRED)
 * and re-running verify-cc1-money-orphan-guard-registry-batch.mjs, which flagged this one too.
 * Verify-step 11577, CC-1 band.
 */
export default {
  name: "verify-dispatch-reads-live-loads-view",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatch-reads-live-loads-view.mjs"]);
  },
};
