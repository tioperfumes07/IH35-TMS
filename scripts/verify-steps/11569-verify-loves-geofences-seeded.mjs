/**
 * docs/audit/GUARD-WORKORDERS.md ORPHAN-GUARD-REGISTRY-2-NEW-GUARDS-UNWIRED (CC-3-filed, 2026-09-22):
 * verify-loves-geofences-seeded.mjs (PR #22221, Love's 604 geofences) runs correctly via
 * money-pr-local-gate.mjs on every push, but was never wired into the CI verify-steps + orphan-
 * guard-registry matrix. Verify-step 11569, CC-1 band.
 */
export default {
  name: "verify-loves-geofences-seeded",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-loves-geofences-seeded.mjs"]);
  },
};
