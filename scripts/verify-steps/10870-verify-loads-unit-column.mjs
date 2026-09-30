export default {
  name: "verify-loads-unit-column-is-assigned-unit-id",
  async run(ctx) {
    // ROUND 293 — mdata.loads.unit_id does not exist. A bare unit_id in a loads-only SQL block
    // 500'd the entire Company Settlements register on 2026-09-30.
    await ctx.run("node", ["scripts/verify-loads-unit-column-is-assigned-unit-id.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-loads-unit-column-is-assigned-unit-id.mjs"]);
  },
};
