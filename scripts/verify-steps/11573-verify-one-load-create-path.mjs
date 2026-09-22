/**
 * docs/audit/GUARD-WORKORDERS.md ORPHAN-GUARD-REGISTRY-2-NEW-GUARDS-UNWIRED (CC-3-filed, 2026-09-22):
 * verify-one-load-create-path.mjs (PR #22244, FEED-PARITY-01, createLoadWithFullSideEffects) runs
 * correctly via money-pr-local-gate.mjs on every push, but was never wired into the CI verify-steps
 * + orphan-guard-registry matrix. Verify-step 11573, CC-1 band.
 */
export default {
  name: "verify-one-load-create-path",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-one-load-create-path.mjs"]);
  },
};
