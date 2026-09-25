/**
 * ROUND 173 pt 5 (Lead, 2026-09-25) — wires scripts/verify-presettlement-shows-whole-tour.mjs
 * into CI. LANE_CROSS: docs/bus/09-25-2026-LEAD-RULING-R183-CC3-VERIFY-STEPS-LANE-CROSS.md.
 * Live guard — requires DATABASE_URL (whole-tour load count vs. the legs-shaped query).
 */
export default {
  name: "verify-presettlement-shows-whole-tour",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-presettlement-shows-whole-tour.mjs"]);
  },
};
