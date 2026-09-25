/**
 * ROUND 173 pt 5 / ROUND 166.1 pt 3 (Lead, 2026-09-25) — wires
 * scripts/verify-load-views-current-trip-only.mjs into CI. LANE_CROSS:
 * docs/bus/09-25-2026-LEAD-RULING-R183-CC3-VERIFY-STEPS-LANE-CROSS.md.
 * Live guard — requires DATABASE_URL (static resolver-shape lock + live population checks).
 */
export default {
  name: "verify-load-views-current-trip-only",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-load-views-current-trip-only.mjs"]);
  },
};
