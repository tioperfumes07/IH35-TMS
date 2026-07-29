// Step 1752 — FleetTable's STATUS column resolver must route the raw enum through
// humanizeEnumLabel(); prod showed "InService" on all 109 visible units. Rule 17: guards wire
// ONLY through scripts/verify-steps/NNNN-*.mjs.
export default {
  name: "verify-fleet-table-status-humanized",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fleet-table-status-humanized.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-fleet-table-status-humanized.mjs"]);
  },
};
