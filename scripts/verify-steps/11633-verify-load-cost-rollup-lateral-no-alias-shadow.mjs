/**
 * ACCT-F2026092587 (CC-3, 2026-09-25) — wires
 * scripts/verify-load-cost-rollup-lateral-no-alias-shadow.mjs into CI. LANE_CROSS:
 * docs/bus/09-25-2026-LEAD-RULING-R192-CC3-COST-ROLLUP-GUARD-LANE-CROSS.md.
 * Live guard — requires DATABASE_URL (static alias-shadow lock + live per-load cross-check
 * against independently-computed truth).
 */
export default {
  name: "verify-load-cost-rollup-lateral-no-alias-shadow",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-load-cost-rollup-lateral-no-alias-shadow.mjs"]);
  },
};
