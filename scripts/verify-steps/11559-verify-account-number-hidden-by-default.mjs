/**
 * ROUND 83 RULING 1 (Lead, 2026-09-22) — account numbers hidden app-wide by default. Lane-cross
 * granted: docs/bus/2026-09-22-LEAD-RULING-ROUND-83-CC2-LANE-CROSS-ACCOUNT-NUMBER-GUARD.md.
 * Verify-step 11559, CC-2 band.
 */
export default {
  name: "verify-account-number-hidden-by-default",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-account-number-hidden-by-default.mjs"]);
  },
};
